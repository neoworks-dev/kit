// SPDX-License-Identifier: MPL-2.0

// The AI sidebar's conversation: connects this window to the harness sidecar
// (NWHarness.sys.mts), keeps one session per chat and turns the session's ACP
// updates into chat items.
//
// Sessions run with Kit's own system prompt (system-prompt.ts), no built-in
// tools and none of the harness's own config or extras. The agent's one tool is Kit's `bidi` MCP
// endpoint (NWAgentBrowser.sys.mts), which asks the user itself when an action
// needs it, so the harness doesn't ask again for each call.

// Must run before the harness client loads zod.
import "./zod-jitless.ts";
import { batch, createSignal } from "solid-js";
import {
  HarnessClient,
  type HarnessSession,
  type PermissionReply,
  type RequestPermissionRequest,
} from "@neoworks/harness/client";
import type {
  AgentApproval,
  AgentBrowserModule,
  AgentEndpoint,
  ConnectionState,
  HarnessId,
  HarnessInfo,
  HarnessModule,
  ModelInfo,
} from "./types.ts";
import { createConversation } from "./conversation.ts";
import { SYSTEM_PROMPT } from "./system-prompt.ts";

const HARNESS_PREF = "neoworks.ai.harness";
const MODEL_PREF_PREFIX = "neoworks.ai.model.";
const DEFAULT_HARNESS: HarnessId = "claude";
// An empty directory the sessions run in, so no project instructions leak in.
const SESSION_DIR = PathUtils.join(PathUtils.profileDir, "neoworks-ai");

const [connection, setConnection] = createSignal<ConnectionState>({ kind: "idle" });
const [harnesses, setHarnesses] = createSignal<HarnessInfo[]>([]);
const [models, setModels] = createSignal<ModelInfo[]>([]);
const [harness, setHarness] = createSignal<HarnessId>(
  Services.prefs.getStringPref(HARNESS_PREF, DEFAULT_HARNESS) as HarnessId,
);
const [model, setModel] = createSignal(readModelPref(harness()));
const conversation = createConversation();
const items = conversation.items;
const addItem = conversation.add;
const [running, setRunning] = createSignal(false);

export { connection, harness, harnesses, items, model, models, running };

let client: HarnessClient | null = null;
let session: HarnessSession | null = null;
let sessionKey = "";
let endpoint: AgentEndpoint | null = null;
// Approvals still waiting when the chat ends are declined.
const pendingApprovals = new Set<(allowed: boolean) => void>();

function readModelPref(harnessId: HarnessId): string {
  return Services.prefs.getStringPref(MODEL_PREF_PREFIX + harnessId, "");
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// Shows the request in the chat and waits for the user's answer.
function askPermission(request: RequestPermissionRequest): Promise<PermissionReply> {
  return new Promise((resolve) => {
    const [answered, setAnswered] = createSignal(false);
    addItem({
      kind: "permission",
      request,
      answered,
      answer: (reply) => {
        setAnswered(true);
        resolve(reply);
      },
    });
  });
}

// Kit's own approval for an agent action in the browser.
function askApproval(request: AgentApproval): Promise<boolean> {
  return new Promise((resolve) => {
    const [answered, setAnswered] = createSignal(false);
    const answer = (allowed: boolean) => {
      if (!pendingApprovals.delete(answer)) {
        return;
      }
      setAnswered(true);
      resolve(allowed);
    };
    pendingApprovals.add(answer);
    addItem({ kind: "approval", title: request.title, detail: request.detail, answered, answer });
  });
}

export function agentBrowser(): AgentBrowserModule {
  return ChromeUtils.importESModule(
    "resource://noraneko/modules/NWAgentBrowser.sys.mjs",
  ) as AgentBrowserModule;
}

function openEndpoint(): AgentEndpoint {
  return agentBrowser().openAgentEndpoint({ window, approve: askApproval, stop });
}

function declineApprovals(): void {
  for (const answer of [...pendingApprovals]) {
    answer(false);
  }
}

function closeEndpoint(): void {
  declineApprovals();
  endpoint?.close();
  endpoint = null;
}

async function connectedClient(): Promise<HarnessClient> {
  if (client) {
    return client;
  }
  setConnection({ kind: "connecting" });
  try {
    const { ensureHarness } = ChromeUtils.importESModule(
      "resource://noraneko/modules/NWHarness.sys.mjs",
    ) as HarnessModule;
    const endpoint = await ensureHarness();
    client = await HarnessClient.connect(endpoint);
    setConnection({ kind: "ready" });
    return client;
  } catch (error) {
    setConnection({ kind: "failed", message: errorText(error) });
    throw error;
  }
}

// Connects and loads the harness and model lists for the pickers.
export async function connect(): Promise<void> {
  try {
    const harnessClient = await connectedClient();
    const available = (await harnessClient.listHarnesses()).filter((info) => info.available);
    setHarnesses(available);
    if (available.length > 0 && !available.some((info) => info.id === harness())) {
      setHarness(available[0].id);
    }
    await loadModels();
  } catch (error) {
    console.error("[neoworks-ai] Couldn't connect to the harness:", error);
  }
}

async function loadModels(): Promise<void> {
  if (!client) {
    return;
  }
  const harnessId = harness();
  try {
    const list = await client.listModels(harnessId);
    if (harness() === harnessId) {
      setModels(list);
    }
  } catch (error) {
    console.error(`[neoworks-ai] Couldn't list ${harnessId} models:`, error);
    setModels([]);
  }
}

export function chooseHarness(harnessId: HarnessId): void {
  Services.prefs.setStringPref(HARNESS_PREF, harnessId);
  batch(() => {
    setHarness(harnessId);
    setModel(readModelPref(harnessId));
    setModels([]);
  });
  void loadModels();
}

export function chooseModel(modelId: string): void {
  Services.prefs.setStringPref(MODEL_PREF_PREFIX + harness(), modelId);
  setModel(modelId);
}

// The session for the current harness and model; a new pick starts a new one.
async function currentSession(): Promise<HarnessSession> {
  const key = `${harness()}/${model()}`;
  if (session && sessionKey === key) {
    return session;
  }
  await session?.close();
  closeEndpoint();
  const harnessClient = await connectedClient();
  await IOUtils.makeDirectory(SESSION_DIR, { ignoreExisting: true });
  endpoint = openEndpoint();
  session = await harnessClient.createSession({
    harness: harness(),
    cwd: SESSION_DIR,
    mcpServers: [{
      type: "http",
      name: "kit",
      url: endpoint.url,
      headers: [{ name: "Authorization", value: `Bearer ${endpoint.token}` }],
    }],
    options: {
      systemPrompt: { replace: SYSTEM_PROMPT },
      tools: "none",
      isolation: "full",
      disable: "all",
      permissions: "full-access",
      ...(model() ? { model: model() } : {}),
    },
    onPermission: askPermission,
  });
  sessionKey = key;
  return session;
}

export async function send(text: string): Promise<void> {
  const prompt = text.trim();
  if (!prompt || running()) {
    return;
  }
  addItem({ kind: "user", text: prompt });
  setRunning(true);
  try {
    const activeSession = await currentSession();
    for await (const event of activeSession.prompt(prompt)) {
      if (event.type === "update") {
        conversation.update(event.update);
      }
    }
  } catch (error) {
    console.error("[neoworks-ai] The prompt failed:", error);
    addItem({ kind: "error", text: errorText(error) });
  } finally {
    endpoint?.release();
    setRunning(false);
  }
}

// Puts the agent's helpers file (#53) back to the one Kit ships.
export async function resetHelpers(): Promise<void> {
  try {
    await agentBrowser().resetAgentHelpers();
    addItem({ kind: "notice", text: "Browser helpers reset to Kit's defaults." });
  } catch (error) {
    console.error("[neoworks-ai] Couldn't reset the helpers:", error);
    addItem({ kind: "error", text: errorText(error) });
  }
}

export function stop(): void {
  declineApprovals();
  void session?.cancel();
}

export function newChat(): void {
  stop();
  void session?.close();
  session = null;
  sessionKey = "";
  closeEndpoint();
  conversation.clear();
}

// For hot reload and window close: the sidecar itself keeps running.
export function disconnect(): void {
  newChat();
  void client?.close();
  client = null;
  setConnection({ kind: "idle" });
}
