// SPDX-License-Identifier: MPL-2.0

// The decider's model (#54): a ChromeWorker that NWDeciderChild starts in
// Firefox's "inference" process, where the runtime's native onnxruntime is
// available as the InferenceSession and Tensor globals. One message in, one
// answer out: a jev request and a screenshot become per-question choices.
//
// The parent sends the model files once (LoadMessage): content processes
// can't read files. They come from scripts/export_onnx.py in
// neomme-browser-finetune: model*.onnx, tokenizer.json, temperatures.json and
// config.json.

import type { DeciderRequest } from "../common/NWDeciderRequest.ts";
import { patches } from "../common/NWDeciderImage.ts";
import { DEFAULT_RENDER, positionIds, render, type SpecialTokens } from "../common/NWDeciderRender.ts";

interface OrtTensor {
  data: Float32Array;
}

interface OrtSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}

interface OrtApi {
  InferenceSession: { create(model: Uint8Array, options?: object): Promise<OrtSession> };
  Tensor: new (type: string, data: BigInt64Array | Float32Array, dims: number[]) => OrtTensor;
}

interface Tokenizer {
  encode(text: string, options: { add_special_tokens: boolean }): number[];
}

interface Loaded {
  session: OrtSession;
  tokenizer: Tokenizer;
  special: SpecialTokens;
  temperatures: Record<string, number>;
  maxLen: number;
  maxSide: number;
}

// The model files, read by the parent: content processes can't read files.
export interface LoadMessage {
  type: "load";
  id: number;
  model: string;
  bytes: Uint8Array;
  tokenizer: string;
  config: string;
  temperatures: string;
}

export interface DecideMessage {
  type: "decide";
  id: number;
  model: string;
  request: DeciderRequest;
  // The screenshot (PNG from BiDi; any image format decodes).
  screenshot: Uint8Array;
}

export interface Answer {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface DecideReply {
  id: number;
  // Set when the worker doesn't have this model yet: send a LoadMessage.
  needsLoad?: boolean;
  answers?: Record<string, Answer>;
  tokens?: number;
  ms?: number;
  // Where the time went: decoding and patching the screenshot, rendering and
  // tokenizing the request, and the forward pass.
  timings?: { image: number; render: number; run: number };
  error?: string;
}

const scope = globalThis as unknown as OrtApi & {
  onmessage: ((event: MessageEvent<LoadMessage | DecideMessage>) => void) | null;
  postMessage(message: DecideReply): void;
};

let loaded: { model: string; value: Loaded } | null = null;

async function load(message: LoadMessage): Promise<Loaded> {
  // transformers.js looks for onnxruntime here; give it the native one so it
  // doesn't try to load the WASM build.
  (globalThis as Record<symbol, unknown>)[Symbol.for("onnxruntime")] = {
    InferenceSession: scope.InferenceSession,
    Tensor: scope.Tensor,
    supportedDevices: ["cpu"],
    defaultDevices: ["cpu"],
  };
  const { PreTrainedTokenizer } = await import("chrome://global/content/ml/transformers.js") as {
    PreTrainedTokenizer: new (json: object, config: object) => Tokenizer;
  };
  const config = JSON.parse(message.config) as {
    special_tokens: Record<string, number>;
    render?: { max_len?: number; image?: { max_side?: number } };
  };
  // onnxruntime repacks the weights into its own buffers, so the file's
  // bytes can go once the session exists (see handle()).
  const session = await scope.InferenceSession.create(message.bytes, { executionProviders: ["cpu"] });
  const ids = config.special_tokens;
  const need = (token: string): number => {
    const id = ids[token];
    if (id === undefined) {
      throw new Error(`The tokenizer has no ${token}`);
    }
    return id;
  };
  return {
    session,
    tokenizer: new PreTrainedTokenizer(JSON.parse(message.tokenizer) as object, {}),
    special: {
      doc: need("<doc>"),
      query: need("<query>"),
      mask: need("<mask>"),
      image: need("<img>"),
      row: need("<row>"),
      texts: Object.keys(ids).filter((token) => token.startsWith("<") && token.endsWith(">")),
    },
    temperatures: JSON.parse(message.temperatures) as Record<string, number>,
    // Attention is dense: long inputs cost memory and time on a CPU.
    maxLen: Math.min(config.render?.max_len ?? DEFAULT_RENDER.maxLen, 4096),
    maxSide: config.render?.image?.max_side ?? 512,
  };
}

async function decodePng(bytes: Uint8Array): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>]));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  context.drawImage(bitmap, 0, 0);
  const data = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return { rgba: data.data, width: bitmap.width, height: bitmap.height };
}

function questionKind(id: string): string {
  if (id === "operation") {
    return "operation";
  }
  return id.endsWith("_target") ? "target" : "general";
}

async function decide(message: DecideMessage): Promise<DecideReply> {
  const started = Date.now();
  if (loaded?.model !== message.model) {
    return { id: message.id, needsLoad: true };
  }
  const model = loaded.value;
  const image = await decodePng(message.screenshot);
  const { pixels, grid } = patches(image.rgba, image.height, image.width, model.maxSide);
  const imaged = Date.now();
  const encode = (texts: string[]) =>
    texts.map((text) => text ? model.tokenizer.encode(text, { add_special_tokens: false }) : []);
  const rendered = render(message.request, grid, encode, model.special, { ...DEFAULT_RENDER, maxLen: model.maxLen });
  const length = rendered.inputIds.length;
  const [rows, columns] = positionIds(length, grid);
  const markers = rendered.questions.flatMap((question) => question.positions);
  const renderedAt = Date.now();
  const { Tensor } = scope;
  const outputs = await model.session.run({
    input_ids: new Tensor("int64", BigInt64Array.from(rendered.inputIds, BigInt), [1, length]),
    position_ids: new Tensor("int64", BigInt64Array.from([...rows, ...columns], BigInt), [2, 1, length]),
    pixel_values: new Tensor("float32", pixels, [pixels.length / 3072, 3072]),
    marker_pos: new Tensor("int64", BigInt64Array.from(markers, BigInt), [markers.length]),
  });
  const logits = outputs.logits.data;
  const answers: Record<string, Answer> = {};
  let start = 0;
  for (const question of rendered.questions) {
    const temperature = model.temperatures[questionKind(question.id)] ?? 1;
    const scaled = question.ids.map((_, i) => logits[start + i] / temperature);
    start += question.ids.length;
    const top = Math.max(...scaled);
    const exp = scaled.map((value) => Math.exp(value - top));
    const total = exp.reduce((sum, value) => sum + value, 0);
    const probabilities: Record<string, number> = {};
    let best = 0;
    question.ids.forEach((id, i) => {
      probabilities[id] = exp[i] / total;
      if (exp[i] > exp[best]) {
        best = i;
      }
    });
    answers[question.id] = { choice: question.ids[best], confidence: exp[best] / total, probabilities };
  }
  const finished = Date.now();
  return {
    id: message.id,
    answers,
    tokens: length,
    ms: finished - started,
    timings: { image: imaged - started, render: renderedAt - imaged, run: finished - renderedAt },
  };
}

async function handle(message: LoadMessage | DecideMessage): Promise<DecideReply> {
  if (message.type === "load") {
    loaded = null;
    loaded = { model: message.model, value: await load(message) };
    // Drop the model file's bytes (a few hundred MB) for the GC.
    (message as { bytes: Uint8Array | null }).bytes = null;
    return { id: message.id };
  }
  return await decide(message);
}

scope.onmessage = (event: MessageEvent<LoadMessage | DecideMessage>) => {
  handle(event.data).then(
    (reply) => scope.postMessage(reply),
    (error: unknown) =>
      scope.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) }),
  );
};
