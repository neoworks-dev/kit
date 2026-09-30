// SPDX-License-Identifier: MPL-2.0

import { Show } from "solid-js";
import { openTabContextMenu } from "./context-menu.tsx";
import { foreignContainerColor } from "./identity-colors.ts";
import { isNewTabPage } from "./new-tab-container.ts";
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
import { removeFromSplit } from "../neoworks-split/split-view.ts";
import type { SplitTab } from "../neoworks-split/types.ts";
import { hoverTab, unhoverTab } from "./tab-preview.ts";
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
    <span
      class="nw-icon nw-favicon-placeholder"
      data-icon="globe"
      data-busy={attributeFlag(props.busy)}
    />
  );
  return (
    <span class="nw-favicon">
      <Show when={props.source && !props.busy} fallback={placeholder}>
        <img src={props.source} alt="" draggable="false" />
      </Show>
    </span>
  );
}

// Kit's own new tab page has no favicon; it shows Kit's logo instead.
const KIT_LOGO = "chrome://branding/content/icon32.png";

export function tabIcon(tab: BrowserTab): string {
  if (isNewTabPage(tab.linkedBrowser.currentURI?.spec ?? "")) {
    return KIT_LOGO;
  }
  return tab.image;
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
  const favicon = read(() => tabIcon(tab));
  const selected = read(() => tab.selected);
  const busy = read(() => tab.hasAttribute("busy"));
  const unloaded = read(() => tab.hasAttribute("pending"));
  const playing = read(() => tab.hasAttribute("soundplaying"));
  const muted = read(() => tab.muted);
  const container = read(() => foreignContainerColor(tab.userContextId));
  const audio = read(() => audioIcon(tab));
  const pinned = read(() => tab.pinned);
  const inSplit = read(() => !!tab.splitview);
  // Set while the AI agent works in the tab (NWAgentBrowser.sys.mts).
  const aiControlled = read(() => tab.hasAttribute("nw-ai-controlled"));

  return (
    <div
      class="nw-tab"
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
      onMouseEnter={(event: MouseEvent) => hoverTab(tab, event.currentTarget as Element)}
      onMouseLeave={unhoverTab}
    >
      <Show when={container()}>
        {(color) => <span class="nw-tab-container" style={{ background: color() }} />}
      </Show>
      <Favicon source={favicon()} busy={busy()} />
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
      <Show when={aiControlled()}>
        <span class="nw-icon nw-tab-ai" data-icon="sparkle" title="AI is controlling this tab" />
      </Show>
      <span class="nw-tab-label">{label()}</span>
      {/* Laid over the label's end on hover (sidebar.css). */}
      <div class="nw-tab-actions">
        <Show when={inSplit()}>
          <button
            type="button"
            class="nw-icon-button nw-tab-action"
            title="Remove from split"
            onClick={stopThen(() => removeFromSplit(tab as SplitTab))}
          >
            <span class="nw-icon" data-icon="arrow-square-out" />
          </button>
        </Show>
        <button
          type="button"
          class="nw-icon-button nw-tab-action"
          title={pinned() ? "Unpin tab" : "Pin tab"}
          onClick={stopThen(() => togglePinned(tab))}
        >
          <span class="nw-icon" data-icon={pinned() ? "push-pin-slash" : "push-pin"} />
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
    </div>
  );
}
