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
// so a chunk re-renders only that message.
export type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: () => string; append: (chunk: string) => void }
  | { kind: "thought"; text: () => string; append: (chunk: string) => void }
  | { kind: "tool"; id: string; title: () => string; status: () => ToolStatus }
  | { kind: "permission"; request: RequestPermissionRequest; answer: (reply: PermissionReply) => void; answered: () => boolean }
  | { kind: "approval"; title: string; detail: string; answer: (allowed: boolean) => void; answered: () => boolean }
  | { kind: "error"; text: string };

export type ToolStatus = "pending" | "in_progress" | "completed" | "failed";

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

// One entry in a composer dropdown (picker.tsx).
export interface PickerOption {
  value: string;
  label: string;
  // An .nw-icon data-icon name.
  icon?: string;
}
