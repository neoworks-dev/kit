// SPDX-License-Identifier: MPL-2.0

// A conversation as the panel shows it: chat items built from a session's ACP
// updates. Kit's own chats (chat.ts) and the companion (companion.ts) each
// keep one.

import { createSignal, type Accessor } from "solid-js";
import type { SessionUpdate } from "@neoworks/harness/client";
import type { ChatItem, ToolStatus } from "./types.ts";

interface ToolUpdater {
  setTitle(title: string): void;
  setStatus(status: ToolStatus): void;
  setInput(input: string): void;
  setOutput(output: string): void;
}

export interface Conversation {
  items: Accessor<ChatItem[]>;
  add(item: ChatItem): void;
  update(update: SessionUpdate): void;
  clear(): void;
}

export function createConversation(): Conversation {
  const [items, setItems] = createSignal<ChatItem[]>([]);
  const toolUpdaters = new Map<string, ToolUpdater>();

  function add(item: ChatItem): void {
    setItems((current) => [...current, item]);
  }

  // Appends to the message being streamed, or starts a new one.
  function appendText(kind: "assistant" | "thought", chunk: string): void {
    const last = items().at(-1);
    if ((last?.kind === "assistant" || last?.kind === "thought") && last.kind === kind) {
      last.append(chunk);
      return;
    }
    const [text, setText] = createSignal("");
    const item: Extract<ChatItem, { kind: "assistant" | "thought" }> = {
      kind,
      text,
      append: (more) => setText((value) => value + more),
    };
    item.append(chunk);
    add(item);
  }

  function addTool(id: string, title: string, status: ToolStatus, input: string): void {
    const [toolTitle, setTitle] = createSignal(title);
    const [toolStatus, setStatus] = createSignal(status);
    const [toolInput, setInput] = createSignal(input);
    const [toolOutput, setOutput] = createSignal("");
    toolUpdaters.set(id, { setTitle, setStatus, setInput, setOutput });
    add({ kind: "tool", id, title: toolTitle, status: toolStatus, input: toolInput, output: toolOutput });
  }

  function update(update: SessionUpdate): void {
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
      case "agent_thought_chunk": {
        if (update.content.type === "text") {
          const kind = update.sessionUpdate === "agent_message_chunk" ? "assistant" : "thought";
          appendText(kind, update.content.text);
        }
        return;
      }
      case "tool_call":
        addTool(
          update.toolCallId,
          toolTitle(update.title, update.rawInput) ?? "Tool",
          update.status ?? "pending",
          toolInputText(update.rawInput),
        );
        return;
      case "tool_call_update": {
        const updater = toolUpdaters.get(update.toolCallId);
        const title = toolTitle(update.title, update.rawInput);
        if (title) {
          updater?.setTitle(title);
        }
        if (update.status) {
          updater?.setStatus(update.status);
        }
        const input = toolInputText(update.rawInput);
        if (input) {
          updater?.setInput(input);
        }
        const output = toolOutputText(update.content);
        if (output) {
          updater?.setOutput(output);
        }
        return;
      }
      default:
        return;
    }
  }

  function clear(): void {
    toolUpdaters.clear();
    setItems([]);
  }

  return { items, add, update, clear };
}

// What the tool was called with, for the expanded row, as JSON.
function toolInputText(rawInput: unknown): string {
  if (typeof rawInput !== "object" || rawInput === null || Object.keys(rawInput).length === 0) {
    return "";
  }
  return JSON.stringify(rawInput, null, 2);
}

// The text the tool returned; images are left out.
function toolOutputText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return content.flatMap((entry: unknown) => {
    const block = (entry as { content?: { type?: string; text?: unknown } }).content;
    return block?.type === "text" && typeof block.text === "string" ? [block.text] : [];
  }).join("\n\n");
}

// Kit's browser tools show as what they do: a `bidi` call as its command
// ("browsingContext.navigate"), a helper as its call ("helper: snapshot").
function toolTitle(title: string | null | undefined, rawInput: unknown): string | undefined {
  const input = typeof rawInput === "object" && rawInput !== null ? rawInput as Record<string, unknown> : {};
  if (typeof input.method === "string" && input.method) {
    return input.method;
  }
  if (title?.endsWith("helpers_source")) {
    return "Read browser helpers";
  }
  if (title?.endsWith("helpers_edit")) {
    return "Edit browser helpers";
  }
  if (typeof input.name === "string" && input.name) {
    return `helper: ${input.name}`;
  }
  return title ?? undefined;
}
