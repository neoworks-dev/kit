// SPDX-License-Identifier: MPL-2.0

// Runs in Firefox's "inference" process for NWDecider.sys.mts (#54): starts
// the decider's worker there, where the native onnxruntime is exposed, and
// relays requests to it. The worker keeps the model loaded between requests.

import type { DecideMessage, DecideReply, LoadMessage } from "../modules/NWDecider.worker.mts";

const WORKER_URL = "resource://noraneko/modules/NWDecider.worker.mjs";

let worker: ChromeWorker | null = null;
let nextId = 1;
const pending = new Map<number, (reply: DecideReply) => void>();

function ensureWorker(): ChromeWorker {
  if (!worker) {
    worker = new ChromeWorker(WORKER_URL, { type: "module" });
    worker.onmessage = (event: Event) => {
      const reply = (event as MessageEvent<DecideReply>).data;
      pending.get(reply.id)?.(reply);
      pending.delete(reply.id);
    };
    worker.onerror = (event: ErrorEvent) => {
      console.error("[NWDecider] worker error:", event.message);
      for (const [id, resolve] of pending) {
        resolve({ id, error: event.message || "the decider's worker failed" });
      }
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

export class NWDeciderChild extends JSProcessActorChild {
  receiveMessage(
    message: { name: string; data: Omit<LoadMessage, "id"> | Omit<DecideMessage, "id"> },
  ): Promise<DecideReply> | undefined {
    if (message.name !== "NWDecider:Message") {
      return undefined;
    }
    const id = nextId++;
    const data = { ...message.data, id };
    return new Promise((resolve) => {
      pending.set(id, resolve);
      // The model bytes move to the worker instead of being copied.
      const transfer = data.type === "load" ? [data.bytes.buffer] : [];
      ensureWorker().postMessage(data, transfer as Transferable[]);
    });
  }

  didDestroy(): void {
    worker?.terminate();
    worker = null;
  }
}
