// SPDX-License-Identifier: MPL-2.0

// Grove's local API protocol, Kit's end of it: ndjson frames of RPC messages
// over a unix socket, as in Grove's sdk/src/frames.ts and sdk/src/rpc.ts
// (neoworks-dev/grove). Both ends send requests: Grove's ids are even, a
// client's odd. No streams; Kit neither asks for nor serves any.
//
// Pure: the socket itself is NWGrove.sys.mts's.

export const MAX_FRAME_BYTES = 8 * 1024 * 1024;

// An error reply. Grove's own codes are strings; a CDP error's code is the
// CDP number, which Grove passes on as it is.
export interface RpcError {
  message: string;
  code?: string | number;
}

export type RpcMessage =
  | { kind: "request"; id: number; method: string; params: unknown; streaming?: boolean }
  | { kind: "response"; id: number; result?: unknown; error?: RpcError }
  | { kind: "stream"; id: number; chunk: unknown }
  | { kind: "end"; id: number; error?: RpcError }
  | { kind: "cancel"; id: number }
  | { kind: "event"; channel: string; payload: unknown };

export class FrameError extends Error {}

export function encodeFrame(message: RpcMessage): string {
  return JSON.stringify(message) + "\n";
}

// Splits incoming bytes into messages, one JSON object per line.
export class FrameDecoder {
  #buffer = "";
  // Kept across chunks so UTF-8 split between them survives.
  readonly #textDecoder = new TextDecoder();

  // Every complete message so far. Throws FrameError on an oversized or
  // malformed line; the connection should be dropped then.
  push(data: Uint8Array | string): RpcMessage[] {
    if (typeof data === "string") {
      this.#buffer += data;
    } else {
      this.#buffer += this.#textDecoder.decode(data, { stream: true });
    }
    const messages: RpcMessage[] = [];
    let newline = this.#buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      if (line.trim().length > 0) {
        messages.push(decodeLine(line));
      }
      newline = this.#buffer.indexOf("\n");
    }
    if (this.#buffer.length > MAX_FRAME_BYTES) {
      throw new FrameError("frame exceeds maximum size");
    }
    return messages;
  }
}

function decodeLine(line: string): RpcMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new FrameError("malformed frame: not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FrameError("malformed frame: not an object");
  }
  if (typeof (parsed as { kind?: unknown }).kind !== "string") {
    throw new FrameError("malformed frame: missing kind");
  }
  return parsed as RpcMessage;
}

// An error a request handler throws to answer with a specific code.
export class RpcReplyError extends Error {
  readonly code: string | number;

  constructor(code: string | number, message: string) {
    super(message);
    this.code = code;
  }
}

export type RpcHandler = (params: unknown) => Promise<unknown>;

interface PendingCall {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

// One connection's requests and replies, both ways.
export class RpcEndpoint {
  readonly #post: (message: RpcMessage) => void;
  #nextId: number;
  readonly #pending = new Map<number, PendingCall>();
  readonly #handlers = new Map<string, RpcHandler>();

  constructor(post: (message: RpcMessage) => void, idParity: "even" | "odd") {
    this.#post = post;
    this.#nextId = idParity === "even" ? 0 : 1;
  }

  handle(method: string, handler: RpcHandler): void {
    this.#handlers.set(method, handler);
  }

  event(channel: string, payload: unknown): void {
    this.#post({ kind: "event", channel, payload });
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.#nextId;
    this.#nextId += 2;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#post({ kind: "request", id, method, params });
    });
  }

  // Fails every call still waiting for its reply (the connection closed).
  failAllPending(message: string): void {
    for (const call of this.#pending.values()) {
      call.reject(new RpcReplyError("cancelled", message));
    }
    this.#pending.clear();
  }

  handleMessage(message: RpcMessage): void {
    switch (message.kind) {
      case "request":
        void this.#handleRequest(message);
        return;
      case "response":
      case "end": {
        const call = this.#pending.get(message.id);
        if (!call) {
          return;
        }
        this.#pending.delete(message.id);
        if (message.error) {
          call.reject(new RpcReplyError(message.error.code ?? "internal", message.error.message));
          return;
        }
        call.resolve(message.kind === "response" ? message.result : undefined);
        return;
      }
      default:
        // Events from Grove, cancels and stream chunks: Kit has no use for
        // them yet.
        return;
    }
  }

  async #handleRequest(message: RpcMessage & { kind: "request" }): Promise<void> {
    const handler = this.#handlers.get(message.method);
    if (!handler) {
      this.#reply(message, undefined, { message: `unknown method: ${message.method}`, code: "invalid" });
      return;
    }
    try {
      this.#reply(message, await handler(message.params), undefined);
    } catch (error) {
      if (error instanceof RpcReplyError) {
        this.#reply(message, undefined, { message: error.message, code: error.code });
        return;
      }
      this.#reply(message, undefined, { message: error instanceof Error ? error.message : String(error), code: "internal" });
    }
  }

  #reply(message: RpcMessage & { kind: "request" }, result: unknown, error: RpcError | undefined): void {
    if (message.streaming) {
      this.#post({ kind: "end", id: message.id, error });
      return;
    }
    if (error) {
      this.#post({ kind: "response", id: message.id, error });
      return;
    }
    this.#post({ kind: "response", id: message.id, result: result ?? null });
  }
}
