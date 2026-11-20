// SPDX-License-Identifier: MPL-2.0

import type {
  HarnessId,
  HarnessInfo,
  ModelInfo,
  PermissionReply,
  RequestPermissionRequest,
} from "@neoworks/harness/client";

export type { HarnessId, HarnessInfo, ModelInfo };

export type PermissionOption = RequestPermissionRequest["options"][number];

// Where the connection to the harness sidecar stands.
export type ConnectionState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "ready" }
  | { kind: "failed"; message: string };

// One row in the conversation. Streamed text grows through its own signal
// so a chunk re-renders only that message. `from` names the app a companion
// message came from when it wasn't Kit.
export type ChatItem =
  | { kind: "user"; text: string; from?: string }
  | { kind: "ramble"; capture: RambleCapture; from?: string }
  | { kind: "assistant"; text: () => string; append: (chunk: string) => void }
  | { kind: "thought"; text: () => string; append: (chunk: string) => void }
  | { kind: "tool"; id: string; title: () => string; status: () => ToolStatus; input: () => string; output: () => string }
  | { kind: "permission"; request: RequestPermissionRequest; answer: (reply: PermissionReply) => void; answered: () => boolean }
  | { kind: "approval"; title: string; detail: string; answer: (allowed: boolean) => void; answered: () => boolean }
  | { kind: "error"; text: string }
  | { kind: "notice"; text: string };

export type ToolStatus = "pending" | "in_progress" | "completed" | "failed";

// The panel shows Kit's own chats, or the companion: the one agent shared by
// the user's apps (NWCompanion.sys.mts).
export type PanelMode = "chat" | "companion";

export type CompanionModule = typeof import("../../../modules/modules/NWCompanion.sys.mts");

export type {
  CompanionAsk,
  CompanionEntry,
  CompanionState,
  ContentBlock,
  Skill,
} from "../../../modules/modules/NWCompanion.sys.mts";

// Kit's own window-level API of NWHarness.sys.mts.
export interface HarnessModule {
  ensureHarness(): Promise<{ url: string; token: string }>;
}

// NWAgentBrowser.sys.mts: the agent's browser tool, one endpoint per chat.
export interface AgentApproval {
  title: string;
  detail: string;
}

export interface AgentEndpoint {
  url: string;
  token: string;
  release(): void;
  close(): void;
}

export interface AgentBrowserModule {
  openAgentEndpoint(options: {
    window: Window;
    approve(request: AgentApproval): Promise<boolean>;
    stop(): void;
  }): AgentEndpoint;
  stopAgentInTab(tab: Element): void;
  resetAgentHelpers(): Promise<void>;
}

// The Markdown subset chat answers are rendered with (markdown.tsx).
export type MarkdownBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "code"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

export type MarkdownInline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; url: string };

// A ramble from the desktop overlay: what the user said, word by word, and
// what they did meanwhile (circled, clicked, selected…), timed from its start.
// The overlay's capture contract (overlay src/capture.ts), version 1.
export interface RambleCapture {
  version: 1;
  startedAt: number;
  endedAt: number;
  words: { text: string; at: number }[];
  events: RambleEvent[];
  screenshots: { path: string; monitor: string; scale: number }[];
  speechErrors: string[];
}

export interface RamblePlace {
  monitor: string;
  x: number;
  y: number;
}

export type RambleThing =
  | { kind: "widget"; id: string }
  | { kind: "window"; class: string; title: string }
  | { kind: "desktop" };

export type RambleEvent =
  | { kind: "cursor"; at: number; place: RamblePlace; on: RambleThing }
  | { kind: "click"; at: number; place: RamblePlace; on: RambleThing }
  | { kind: "circle"; at: number; box: RamblePlace & { width: number; height: number }; on: RambleThing }
  | { kind: "line"; at: number; from: RamblePlace; fromThing: RambleThing; to: RamblePlace; toThing: RambleThing }
  | { kind: "scribble"; at: number; box: RamblePlace & { width: number; height: number }; on: RambleThing }
  | { kind: "selection"; at: number; text: string }
  | { kind: "workspace"; at: number; workspace: string }
  | { kind: "focus"; at: number; window: { class: string; title: string } }
  | { kind: "drag"; at: number; widget: string; place: RamblePlace }
  | { kind: "screenshot"; at: number; index: number };

// A ramble card's contents: runs of words with what the user did between them.
export type RambleSegment =
  | { kind: "words"; text: string }
  | { kind: "event"; label: string; icon: string; screenshot: string | null };

// One entry in a composer dropdown (picker.tsx).
export interface PickerOption {
  value: string;
  label: string;
  // An .nw-icon data-icon name.
  icon?: string;
}
