// SPDX-License-Identifier: MPL-2.0

import { createEffect, createSignal, For, Match, on, Show, Switch, type JSX } from "solid-js";
import {
  chooseHarness,
  chooseModel,
  connect,
  connection,
  harness,
  harnesses,
  items,
  model,
  models,
  newChat,
  resetHelpers,
  running,
  send,
  stop,
} from "./chat.ts";
import { Markdown } from "./markdown.tsx";
import { aiPanelOpen, closeAiPanel } from "./panel.ts";
import { Picker } from "./picker.tsx";
import type { ChatItem, ConnectionState, HarnessId, PermissionOption, PickerOption } from "./types.ts";

const HARNESSES: Record<HarnessId, { label: string; icon: string }> = {
  claude: { label: "Claude Code", icon: "claude" },
  codex: { label: "Codex", icon: "open-ai-logo" },
  pi: { label: "pi", icon: "pi" },
};

function flag(enabled: boolean): string | undefined {
  return enabled ? "true" : undefined;
}

function harnessOptions(): PickerOption[] {
  return harnesses().map((info) => ({ value: info.id, ...HARNESSES[info.id] }));
}

function modelOptions(): PickerOption[] {
  return [
    { value: "", label: "Default model" },
    ...models().map((info) => ({ value: info.id, label: info.name })),
  ];
}

// Harness and model, under the message input.
function Pickers() {
  return (
    <div class="nw-ai-pickers">
      <Picker
        title="Harness"
        options={harnessOptions()}
        value={harness()}
        onChange={(value) => chooseHarness(value as HarnessId)}
      />
      <Picker title="Model" options={modelOptions()} value={model()} onChange={chooseModel} />
    </div>
  );
}

function Header() {
  return (
    <div class="nw-ai-header">
      <span class="nw-ai-title">AI</span>
      <button
        type="button"
        class="nw-ai-icon-button"
        title="Reset browser helpers to Kit's defaults"
        onClick={() => void resetHelpers()}
      >
        <span class="nw-icon" data-icon="arrow-counter-clockwise" />
      </button>
      <button type="button" class="nw-ai-icon-button" title="New chat" onClick={newChat}>
        <span class="nw-icon" data-icon="plus" />
      </button>
      <button type="button" class="nw-ai-icon-button" title="Close" onClick={closeAiPanel}>
        <span class="nw-icon" data-icon="x" />
      </button>
    </div>
  );
}

function allowOption(options: PermissionOption[]): PermissionOption | undefined {
  return options.find((option) => option.kind === "allow_once") ??
    options.find((option) => option.kind === "allow_always");
}

function PermissionRow(props: { item: Extract<ChatItem, { kind: "permission" }> }) {
  const title = props.item.request.toolCall.title ?? "Use a tool";
  return (
    <div class="nw-ai-permission" data-answered={flag(props.item.answered())}>
      <span class="nw-ai-permission-title">{title}</span>
      <Show when={!props.item.answered()}>
        <div class="nw-ai-permission-actions">
          <button type="button" class="nw-ai-button" onClick={() => props.item.answer("reject")}>
            Deny
          </button>
          <Show when={allowOption(props.item.request.options)}>
            <button
              type="button"
              class="nw-ai-button nw-ai-button-primary"
              onClick={() => props.item.answer("once")}
            >
              Allow
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}

// Kit's own gate on what the agent does in the browser (NWAgentBrowser).
function ApprovalRow(props: { item: Extract<ChatItem, { kind: "approval" }> }) {
  return (
    <div class="nw-ai-permission" data-answered={flag(props.item.answered())}>
      <span class="nw-ai-permission-title">{props.item.title}</span>
      <span class="nw-ai-permission-detail">{props.item.detail}</span>
      <Show when={!props.item.answered()}>
        <div class="nw-ai-permission-actions">
          <button type="button" class="nw-ai-button" onClick={() => props.item.answer(false)}>
            Deny
          </button>
          <button
            type="button"
            class="nw-ai-button nw-ai-button-primary"
            onClick={() => props.item.answer(true)}
          >
            Allow
          </button>
        </div>
      </Show>
    </div>
  );
}

// One line; a click shows the whole title, the call's input and its result.
function ToolRow(props: { item: Extract<ChatItem, { kind: "tool" }> }) {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="nw-ai-tool" data-status={props.item.status()} data-open={flag(open())}>
      <button type="button" class="nw-ai-tool-header" onClick={() => setOpen(!open())}>
        <span class="nw-ai-tool-dot" />
        <span class="nw-ai-tool-title">{props.item.title()}</span>
        <span class="nw-icon nw-ai-tool-chevron" data-icon="caret-right" />
      </button>
      <Show when={open()}>
        <Show when={props.item.input()}>
          <pre class="nw-ai-tool-detail">{props.item.input()}</pre>
        </Show>
        <Show when={props.item.output()}>
          <pre class="nw-ai-tool-detail">{props.item.output()}</pre>
        </Show>
      </Show>
    </div>
  );
}

function ItemRow(props: { item: ChatItem }): JSX.Element {
  const item = props.item;
  switch (item.kind) {
    case "user":
      return <div class="nw-ai-message nw-ai-user">{item.text}</div>;
    case "assistant":
      return (
        <div class="nw-ai-message nw-ai-assistant">
          <Markdown text={item.text()} />
        </div>
      );
    case "thought":
      return <div class="nw-ai-thought">{item.text()}</div>;
    case "tool":
      return <ToolRow item={item} />;
    case "permission":
      return <PermissionRow item={item} />;
    case "approval":
      return <ApprovalRow item={item} />;
    case "error":
      return <div class="nw-ai-error">{item.text}</div>;
    case "notice":
      return <div class="nw-ai-notice">{item.text}</div>;
  }
}

function failureMessage(state: ConnectionState): string {
  return state.kind === "failed" ? state.message : "";
}

function EmptyState() {
  return (
    <div class="nw-ai-empty">
      <span class="nw-icon" data-icon="sparkle" />
      <Switch fallback={<span>Ask anything.</span>}>
        <Match when={connection().kind === "connecting"}>
          <span>Starting the harness…</span>
        </Match>
        <Match when={connection().kind === "failed" && connection()}>
          {(failed) => (
            <>
              <span>Couldn't start the harness.</span>
              <span class="nw-ai-empty-detail">
                {failureMessage(failed())}
              </span>
              <button type="button" class="nw-ai-button" onClick={() => void connect()}>
                Try again
              </button>
            </>
          )}
        </Match>
      </Switch>
    </div>
  );
}

function Composer() {
  const [draft, setDraft] = createSignal("");
  const input = (
    <textarea
      class="nw-ai-input"
      rows="1"
      placeholder="Message"
      value={draft()}
      onInput={(event: InputEvent) => {
        const area = event.currentTarget as HTMLTextAreaElement;
        setDraft(area.value);
        area.style.height = "auto";
        area.style.height = `${area.scrollHeight}px`;
      }}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          submit();
        }
        if (event.key === "Escape" && running()) {
          event.preventDefault();
          stop();
        }
      }}
    />
  ) as HTMLTextAreaElement;

  function submit(): void {
    const text = draft();
    if (!text.trim() || running()) {
      return;
    }
    setDraft("");
    input.value = "";
    input.style.height = "auto";
    void send(text);
  }

  // Focus the input whenever the panel opens.
  createEffect(on(aiPanelOpen, (isOpen) => {
    if (isOpen) {
      requestAnimationFrame(() => input.focus());
    }
  }));

  return (
    <div class="nw-ai-composer">
      {input}
      <div class="nw-ai-composer-bar">
        <Pickers />
        <Show
          when={running()}
          fallback={
            <button
              type="button"
              class="nw-ai-send"
              title="Send"
              disabled={!draft().trim() || undefined}
              onClick={submit}
            >
              <span class="nw-icon" data-icon="arrow-up" />
            </button>
          }
        >
          <button type="button" class="nw-ai-send" title="Stop" onClick={stop}>
            <span class="nw-icon" data-icon="stop" />
          </button>
        </Show>
      </div>
    </div>
  );
}

export function AiPanel(props: { style: string }) {
  const list = (
    <div class="nw-ai-messages">
      <Show when={items().length > 0} fallback={<EmptyState />}>
        <For each={items()}>{(item) => <ItemRow item={item} />}</For>
      </Show>
    </div>
  ) as HTMLDivElement;

  // Keep the newest message in view while the answer streams, unless the user
  // scrolled up to read.
  let pinnedToBottom = true;
  list.addEventListener("scroll", () => {
    pinnedToBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
  });
  const observer = new MutationObserver(() => {
    if (pinnedToBottom) {
      list.scrollTop = list.scrollHeight;
    }
  });
  observer.observe(list, { childList: true, subtree: true, characterData: true });

  return (
    <div id="neoworks-ai" data-open={flag(aiPanelOpen())}>
      <style>{props.style}</style>
      <Header />
      {list}
      <Composer />
    </div>
  );
}
