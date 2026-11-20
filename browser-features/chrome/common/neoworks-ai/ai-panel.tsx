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
import {
  callCompanionHere,
  companionInThisWindow,
  companionItems,
  companionState,
  panelMode,
  resetCompanion,
  sendCompanionAway,
  sendToCompanion,
  setPanelMode,
  stopCompanion,
} from "./companion.ts";
import { Markdown } from "./markdown.tsx";
import { aiPanelOpen, closeAiPanel } from "./panel.ts";
import { Picker } from "./picker.tsx";
import { rambleDuration, rambleSegments } from "./ramble.ts";
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

function inCompanion(): boolean {
  return panelMode() === "companion";
}

function Header() {
  return (
    <Show when={!inCompanion()} fallback={<CompanionHeader />}>
      <ChatHeader />
    </Show>
  );
}

function ChatHeader() {
  return (
    <div class="nw-ai-header">
      <span class="nw-ai-title">AI</span>
      <Show when={companionState().connection === "ready"}>
        <button
          type="button"
          class="nw-ai-icon-button"
          title="The agent your apps share"
          onClick={() => setPanelMode("companion")}
        >
          <span class="nw-icon" data-icon="sparkle" />
        </button>
      </Show>
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

// Where the shared agent is, as the header says it.
function whereLabel(): string {
  const state = companionState();
  if (state.connection !== "ready") {
    return "Not running";
  }
  if (companionInThisWindow()) {
    return "Here";
  }
  if (state.here === null) {
    return "On the desktop";
  }
  if (state.here === state.surfaceId) {
    return "In another window";
  }
  return `In ${state.here.slice(0, state.here.lastIndexOf("-"))}`;
}

// The Agent Control view's header: where the agent is, and moving it.
function CompanionHeader() {
  return (
    <div class="nw-ai-header nw-ai-companion-header" data-here={flag(companionInThisWindow())}>
      <span class="nw-ai-companion-dot" />
      <span class="nw-ai-title">Agent</span>
      <span class="nw-ai-companion-where">{whereLabel()}</span>
      <Show
        when={companionInThisWindow()}
        fallback={
          <Show when={companionState().connection === "ready"}>
            <button type="button" class="nw-ai-icon-button" title="Call the agent here" onClick={callCompanionHere}>
              <span class="nw-icon" data-icon="hand-pointing" />
            </button>
          </Show>
        }
      >
        <button type="button" class="nw-ai-icon-button" title="Send the agent back to the desktop" onClick={sendCompanionAway}>
          <span class="nw-icon" data-icon="sign-out" />
        </button>
      </Show>
      <button type="button" class="nw-ai-icon-button" title="New conversation" onClick={resetCompanion}>
        <span class="nw-icon" data-icon="plus" />
      </button>
      <button type="button" class="nw-ai-icon-button" title="Kit's own chats" onClick={() => setPanelMode("chat")}>
        <span class="nw-icon" data-icon="arrow-left" />
      </button>
      <button type="button" class="nw-ai-icon-button" title="Close" onClick={closeAiPanel}>
        <span class="nw-icon" data-icon="x" />
      </button>
    </div>
  );
}

// A ramble from the desktop: what the user said, with what they did as chips
// where it happened, and the screenshots they drew on.
function RambleCard(props: { item: Extract<ChatItem, { kind: "ramble" }> }) {
  const segments = rambleSegments(props.item.capture);
  return (
    <div class="nw-ai-message nw-ai-user nw-ai-ramble">
      <div class="nw-ai-ramble-header">
        <span class="nw-icon" data-icon="microphone" />
        <span>Ramble</span>
        <span class="nw-ai-ramble-meta">{rambleDuration(props.item.capture)}</span>
      </div>
      <div class="nw-ai-ramble-body">
        <For each={segments}>
          {(segment) => (
            <Switch>
              <Match when={segment.kind === "words" && segment}>
                {(words) => <span class="nw-ai-ramble-words">{words().text} </span>}
              </Match>
              <Match when={segment.kind === "event" && segment}>
                {(event) => (
                  <span class="nw-ai-ramble-chip">
                    <span class="nw-icon" data-icon={event().icon} />
                    {event().label}
                  </span>
                )}
              </Match>
            </Switch>
          )}
        </For>
      </div>
      <Show when={props.item.capture.screenshots.length > 0}>
        <div class="nw-ai-ramble-shots">
          <For each={props.item.capture.screenshots}>
            {(shot) => <img class="nw-ai-ramble-shot" src={PathUtils.toFileURI(shot.path)} alt={`Screenshot of ${shot.monitor}`} />}
          </For>
        </div>
      </Show>
    </div>
  );
}

function From(props: { from?: string }) {
  return (
    <Show when={props.from}>
      <span class="nw-ai-from">from {props.from}</span>
    </Show>
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
      <Show when={props.item.detail}>
        <span class="nw-ai-permission-detail">{props.item.detail}</span>
      </Show>
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
      return (
        <div class="nw-ai-message nw-ai-user">
          <From from={item.from} />
          {item.text}
        </div>
      );
    case "ramble":
      return (
        <>
          <From from={item.from} />
          <RambleCard item={item} />
        </>
      );
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

function CompanionEmptyState() {
  return (
    <div class="nw-ai-empty">
      <span class="nw-icon" data-icon="sparkle" />
      <Switch fallback={<span>The agent your apps share. Ramble about this window, or write to it here.</span>}>
        <Match when={companionState().connection === "absent"}>
          <span>The agent isn't running.</span>
          <span class="nw-ai-empty-detail">systemctl --user start neoworks-harness</span>
        </Match>
        <Match when={companionState().connection === "connecting"}>
          <span>Looking for the agent…</span>
        </Match>
      </Switch>
    </div>
  );
}

// Whether the conversation on show is busy: Kit's chat, or the shared agent.
function busy(): boolean {
  if (inCompanion()) {
    return companionState().running;
  }
  return running();
}

function stopShown(): void {
  if (inCompanion()) {
    stopCompanion();
    return;
  }
  stop();
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
        if (event.key === "Escape" && busy()) {
          event.preventDefault();
          stopShown();
        }
      }}
    />
  ) as HTMLTextAreaElement;

  function submit(): void {
    const text = draft();
    // The shared agent takes a message mid-turn; Kit's own chat waits for the turn to end.
    if (!text.trim() || (!inCompanion() && running())) {
      return;
    }
    setDraft("");
    input.value = "";
    input.style.height = "auto";
    if (inCompanion()) {
      void sendToCompanion(text);
      return;
    }
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
        <Show when={!inCompanion()} fallback={<span class="nw-ai-composer-hint">Shared with your other apps</span>}>
          <Pickers />
        </Show>
        <Show
          when={busy()}
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
          <button type="button" class="nw-ai-send" title="Stop" onClick={stopShown}>
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
      <Show
        when={inCompanion()}
        fallback={
          <Show when={items().length > 0} fallback={<EmptyState />}>
            <For each={items()}>{(item) => <ItemRow item={item} />}</For>
          </Show>
        }
      >
        <Show when={companionItems().length > 0} fallback={<CompanionEmptyState />}>
          <For each={companionItems()}>{(item) => <ItemRow item={item} />}</For>
        </Show>
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
    <div id="neoworks-ai" data-open={flag(aiPanelOpen())} data-mode={panelMode()}>
      <style>{props.style}</style>
      <Header />
      {list}
      <Composer />
    </div>
  );
}
