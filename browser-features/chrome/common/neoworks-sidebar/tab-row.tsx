// SPDX-License-Identifier: MPL-2.0

import { Show } from "solid-js";
import { openTabContextMenu } from "./context-menu.tsx";
import { containerColor } from "./identity-colors.ts";
import {
  closeOnMiddleClick,
  closeTab,
  selectTab,
  togglePinned,
} from "./tab-actions.ts";
import {
  allowDrop,
  dropOntoTab,
  endDrag,
  isDropTarget,
  leaveDrop,
  startTabDrag,
} from "./tab-drag.ts";
import type { BrowserTab, TabState } from "./types.ts";

// solid-xul removes attributes set to undefined.
export function attributeFlag(enabled: boolean): string | undefined {
  if (enabled) {
    return "true";
  }
  return undefined;
}

function stopThen(action: () => void): (event: Event) => void {
  return (event: Event) => {
    event.stopPropagation();
    action();
  };
}

// Getter that re-runs whenever any tab changes.
export function tabReader(tabState: TabState) {
  return <T,>(getter: () => T): (() => T) => () => {
    tabState.revision();
    return getter();
  };
}

export function Favicon(props: { source: string; busy: boolean }) {
  const placeholder = (
    <span class="nw-favicon-placeholder" data-busy={attributeFlag(props.busy)} />
  );
  return (
    <span class="nw-favicon">
      <Show when={props.source && !props.busy} fallback={placeholder}>
        <img src={props.source} alt="" draggable="false" />
      </Show>
    </span>
  );
}

function audioIcon(tab: BrowserTab): string {
  if (tab.muted) {
    return "speaker-slash";
  }
  return "speaker-high";
}

export function TabRow(props: { tab: BrowserTab; tabState: TabState }) {
  const tab = props.tab;
  const read = tabReader(props.tabState);

  const label = read(() => tab.label || "New Tab");
  const favicon = read(() => tab.image);
  const selected = read(() => tab.selected);
  const busy = read(() => tab.hasAttribute("busy"));
  const unloaded = read(() => tab.hasAttribute("pending"));
  const playing = read(() => tab.hasAttribute("soundplaying"));
  const muted = read(() => tab.muted);
  const container = read(() => containerColor(tab.userContextId));
  const audio = read(() => audioIcon(tab));

  return (
    <div
      class="nw-tab"
      title={label()}
      draggable="true"
      data-selected={attributeFlag(selected())}
      data-unloaded={attributeFlag(unloaded())}
      data-drop-target={attributeFlag(isDropTarget(tab))}
      onClick={() => selectTab(tab)}
      onAuxClick={(event: MouseEvent) => closeOnMiddleClick(event, tab)}
      onContextMenu={(event: MouseEvent) => openTabContextMenu(event, tab)}
      onDragStart={(event: DragEvent) => startTabDrag(event, tab)}
      onDragOver={(event: DragEvent) => allowDrop(event, tab)}
      onDragLeave={() => leaveDrop(tab)}
      onDrop={(event: DragEvent) => dropOntoTab(event, tab)}
      onDragEnd={endDrag}
    >
      <Show when={container()}>
        {(color) => <span class="nw-container-dot" style={{ background: color() }} />}
      </Show>
      <Favicon source={favicon()} busy={busy()} />
      <span class="nw-tab-label">{label()}</span>
      <Show when={playing() || muted()}>
        <button
          type="button"
          class="nw-icon-button nw-tab-audio"
          title="Mute / unmute"
          onClick={stopThen(() => tab.toggleMuteAudio())}
        >
          <span class="nw-icon" data-icon={audio()} />
        </button>
      </Show>
      <button
        type="button"
        class="nw-icon-button nw-tab-action"
        title="Pin tab"
        onClick={stopThen(() => togglePinned(tab))}
      >
        <span class="nw-icon" data-icon="push-pin" />
      </button>
      <button
        type="button"
        class="nw-icon-button nw-tab-action"
        title="Close tab"
        onClick={stopThen(() => closeTab(tab))}
      >
        <span class="nw-icon" data-icon="x" />
      </button>
    </div>
  );
}
