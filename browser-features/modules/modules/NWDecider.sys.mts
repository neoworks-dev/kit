// SPDX-License-Identifier: MPL-2.0

// The local decider (#54): NeoMME, fine-tuned as a jev-style "System One"
// that picks the next browser action, run as ONNX on the runtime's native
// onnxruntime. Firefox only exposes that inside its "inference" process, so
// Kit registers its own process actor there (NWDeciderChild), which runs the
// model in a worker (NWDecider.worker.mts).
//
// The model file comes from neoworks.ai.decider.model (a model*.onnx written
// by neomme-browser-finetune's scripts/export_onnx.py, next to its
// tokenizer.json, temperatures.json and config.json). The process is let go a
// few minutes after the last decision, which frees the model's memory.

import type { DeciderRequest } from "../common/NWDeciderRequest.ts";
import type { Answer, DecideReply } from "./NWDecider.worker.mts";

export type { Answer };

const { setTimeout, clearTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs",
) as { setTimeout: typeof globalThis.setTimeout; clearTimeout: typeof globalThis.clearTimeout };

const MODEL_PREF = "neoworks.ai.decider.model";
const IDLE_MS = 5 * 60_000;

interface KeepAlive {
  domProcess: {
    canSend: boolean;
    aboutToLoadOrigin(principal: nsIPrincipal): void;
    getActor(name: string): { sendQuery(name: string, data: unknown): Promise<unknown> };
  };
  invalidateKeepAlive(): void;
}

let keepAlive: KeepAlive | null = null;
// The model the current inference process has loaded.
let loadedModel: string | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let registered = false;

function register(): void {
  if (registered) {
    return;
  }
  try {
    ChromeUtils.registerProcessActor("NWDecider", {
      remoteTypes: ["inference"],
      parent: { esModuleURI: "resource://noraneko/actors/NWDeciderParent.sys.mjs" },
      child: { esModuleURI: "resource://noraneko/actors/NWDeciderChild.sys.mjs" },
    } as ProcessActorOptions);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotSupportedError")) {
      throw error;
    }
  }
  registered = true;
}

export function deciderModel(): string {
  return Services.prefs.getStringPref(MODEL_PREF, "");
}

async function process(): Promise<KeepAlive> {
  if (keepAlive?.domProcess.canSend) {
    return keepAlive;
  }
  register();
  const started = await (ChromeUtils as unknown as {
    ensureHeadlessContentProcess(remoteType: string, options: { preferUsed: boolean }): Promise<KeepAlive | null>;
  }).ensureHeadlessContentProcess("inference", { preferUsed: true });
  if (!started?.domProcess.canSend) {
    throw new Error("Kit couldn't start its inference process.");
  }
  // The worker runs with the system principal inside that process.
  started.domProcess.aboutToLoadOrigin(Services.scriptSecurityManager.getSystemPrincipal());
  keepAlive = started;
  loadedModel = null;
  return started;
}

function releaseLater(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    keepAlive?.invalidateKeepAlive();
    keepAlive = null;
    loadedModel = null;
    idleTimer = null;
  }, IDLE_MS);
}

function base64Bytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Content processes can't read files, so the model goes over in a message.
async function load(
  actor: { sendQuery(name: string, data: unknown): Promise<unknown> },
  model: string,
): Promise<void> {
  const dir = PathUtils.parent(model) ?? "";
  const [bytes, tokenizer, config, temperatures] = await Promise.all([
    IOUtils.read(model),
    IOUtils.readUTF8(PathUtils.join(dir, "tokenizer.json")),
    IOUtils.readUTF8(PathUtils.join(dir, "config.json")),
    IOUtils.readUTF8(PathUtils.join(dir, "temperatures.json")),
  ]);
  const reply = await actor.sendQuery("NWDecider:Message", {
    type: "load",
    model,
    bytes,
    tokenizer,
    config,
    temperatures,
  }) as DecideReply;
  if (reply.error) {
    throw new Error(`The local decider couldn't load ${model}: ${reply.error}`);
  }
  loadedModel = model;
}

// One decision: the choice and confidence for every question of the request.
export async function decide(
  request: DeciderRequest,
  screenshotBase64: string,
): Promise<{ answers: Record<string, Answer>; tokens: number; ms: number; timings?: DecideReply["timings"] }> {
  const model = deciderModel();
  if (!model) {
    throw new Error(`The local decider has no model: set ${MODEL_PREF} to an exported model*.onnx.`);
  }
  const target = await process();
  try {
    const actor = target.domProcess.getActor("NWDecider");
    const ask = () =>
      actor.sendQuery("NWDecider:Message", {
        type: "decide",
        model,
        request,
        screenshot: base64Bytes(screenshotBase64),
      }) as Promise<DecideReply>;
    let reply = loadedModel === model ? await ask() : { id: 0, needsLoad: true };
    if (reply.needsLoad) {
      await load(actor, model);
      reply = await ask();
    }
    if (reply.error || !reply.answers) {
      throw new Error(`The local decider failed: ${reply.error ?? "no answer"}`);
    }
    return { answers: reply.answers, tokens: reply.tokens ?? 0, ms: reply.ms ?? 0, timings: reply.timings };
  } finally {
    releaseLater();
  }
}
