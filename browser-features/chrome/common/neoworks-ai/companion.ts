// SPDX-License-Identifier: MPL-2.0

// The companion as this window shows it: the one agent the user's apps share
// (NWCompanion.sys.mts keeps the connection for all of Kit). The panel shows
// its conversation in companion mode. When the agent comes to Kit, the
// window the user was in becomes its Agent Control view: the panel opens on
// the companion and a frame comes up around the page, from where the
// overlay's drop lands, and stays while the agent is here.

import { createSignal } from "solid-js";
import { createConversation } from "./conversation.ts";
import { rambleOf } from "./ramble.ts";
import { COMPANION_SKILL } from "./system-prompt.ts";
import type {
  CompanionAsk,
  CompanionEntry,
  CompanionModule,
  CompanionState,
  ContentBlock,
  PanelMode,
} from "./types.ts";
import type { SessionUpdate } from "@neoworks/harness/client";

// When the overlay's drop lands on the window, from the move (overlay src/dropArt.ts LAND_MS).
const LAND_MS = 560;
// How long the frame takes to come up from where it landed (control-indicator.css).
export const ARRIVAL_MS = 1100;
// How long the frame takes to draw back in when the agent is pulled out (control-indicator.css).
export const LEAVING_MS = 320;

const [state, setState] = createSignal<CompanionState>({
  connection: "connecting",
  surfaceId: null,
  here: null,
  window: null,
  overlay: false,
  running: false,
});
const [mode, setMode] = createSignal<PanelMode>("chat");
// When the agent last arrived in this window, for the frame's ripple; 0 before.
const [arrivedAt, setArrivedAt] = createSignal(0);
// When the agent last left this window, for the frame drawing back in; 0 before.
const [leftAt, setLeftAt] = createSignal(0);
const conversation = createConversation();
const answers = new Map<number, (answered: boolean) => void>();

export const companionState = state;
export const companionItems = conversation.items;
export const panelMode = mode;
export const companionArrivedAt = arrivedAt;
export const companionLeftAt = leftAt;

export function setPanelMode(next: PanelMode): void {
  setMode(next);
}

// Whether the agent is here in Kit, working in this window.
export function companionInThisWindow(): boolean {
  const current = state();
  return current.here !== null && current.here === current.surfaceId && current.window === window;
}

function companion(): CompanionModule {
  return ChromeUtils.importESModule(
    "resource://noraneko/modules/NWCompanion.sys.mjs",
  ) as CompanionModule;
}

// Starts showing the companion in this window. Returns the remover, for unload.
export function watchCompanion(onArrive: () => void): () => void {
  return companion().watchCompanion({
    state: (next) => {
      const wasHere = companionInThisWindow();
      setState(next);
      if (wasHere && !companionInThisWindow()) {
        setLeftAt(Date.now());
      }
    },
    entry: (entry, live) => onEntry(entry, live, onArrive),
    ask: (ask) => addAsk(ask),
    answered: (id) => answers.get(id)?.(true),
  }, COMPANION_SKILL);
}

function onEntry(entry: CompanionEntry, live: boolean, onArrive: () => void): void {
  switch (entry.kind) {
    case "user":
      addMessage(entry.from, entry.content, entry.display);
      return;
    case "event":
      if (entry.event.type === "update") {
        conversation.update(entry.event.update as SessionUpdate);
      }
      return;
    case "turn":
      return;
    case "moved":
      onMoved(entry, live, onArrive);
      return;
    case "error":
      conversation.add({ kind: "error", text: entry.message });
      return;
    case "skill":
      conversation.add({ kind: "notice", text: `Loaded skill · ${entry.name}` });
      return;
    case "reset":
      answers.clear();
      conversation.clear();
      return;
  }
}

function onMoved(entry: Extract<CompanionEntry, { kind: "moved" }>, live: boolean, onArrive: () => void): void {
  const mine = state().surfaceId;
  if (entry.here !== null && entry.here === mine) {
    conversation.add({ kind: "notice", text: "The agent came to Kit." });
  } else if (entry.from !== null && entry.from === mine) {
    conversation.add({ kind: "notice", text: `The agent went ${whereTo(entry.here)}.` });
  }
  if (!live || !companionInThisWindow()) {
    return;
  }
  // The overlay shows the agent dropping onto this window first; the frame comes up where it lands.
  let delay = 0;
  if (state().overlay && entry.reason !== "detached") {
    delay = LAND_MS;
  }
  setTimeout(() => {
    setMode("companion");
    setArrivedAt(Date.now());
    onArrive();
  }, delay);
}

function whereTo(here: string | null): string {
  if (here === null) {
    return "back to the desktop";
  }
  const app = here.slice(0, here.lastIndexOf("-"));
  return `to ${app}`;
}

function addMessage(from: string, content: ContentBlock[], display: unknown): void {
  let source: string | undefined;
  if (from !== state().surfaceId) {
    source = from.slice(0, from.lastIndexOf("-"));
  }
  const capture = rambleOf(display);
  if (capture !== null) {
    conversation.add({ kind: "ramble", capture, from: source });
    return;
  }
  const text = content
    .flatMap((block) => (block.type === "text" && typeof block.text === "string" ? [block.text] : []))
    .join("\n");
  conversation.add({ kind: "user", text, from: source });
}

function addAsk(ask: CompanionAsk): void {
  const [answered, setAnswered] = createSignal(false);
  answers.set(ask.id, () => {
    answers.delete(ask.id);
    setAnswered(true);
  });
  let detail = "";
  if (ask.kind === "approval") {
    detail = ask.detail;
  }
  conversation.add({
    kind: "approval",
    title: ask.title,
    detail,
    answered,
    answer: (allowed) => companion().answerAsk(ask.id, allowed),
  });
}

export async function sendToCompanion(text: string): Promise<void> {
  const message = text.trim();
  if (!message) {
    return;
  }
  try {
    await companion().sendToCompanion(message);
  } catch (error) {
    conversation.add({ kind: "error", text: error instanceof Error ? error.message : String(error) });
  }
}

export function stopCompanion(): void {
  void companion().cancelCompanion();
}

export function sendCompanionAway(): void {
  void companion().sendCompanionAway();
}

export function callCompanionHere(): void {
  void companion().callCompanionHere(window);
}

export function resetCompanion(): void {
  void companion().resetCompanion();
}
