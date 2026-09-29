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
import { allowTabDrop, dropTabOnto, endTabDrag, startTabDrag } from "./tab-drag.ts";
import type { BrowserTab, TabState } from "./types.ts";

// solid-xul removes attributes set to undefined.
function attributeFlag(enabled: boolean): string | undefined {
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

function Favicon(props: { source: string; busy: boolean }) {
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

export function TabRow(props: { tab: BrowserTab; tabState: TabState }) {
  const tab = props.tab;
  const read = <T,>(getter: () => T): (() => T) => () => {
    props.tabState.revision();
    return getter();
  };

  const label = read(() => tab.label || "New Tab");
  const favicon = read(() => tab.image);
  const selected = read(() => tab.selected);
  const pinned = read(() => tab.pinned);
  const busy = read(() => tab.hasAttribute("busy"));
  const unloaded = read(() => tab.hasAttribute("pending"));
  const playing = read(() => tab.hasAttribute("soundplaying"));
  const muted = read(() => tab.muted);
  const container = read(() => containerColor(tab.userContextId));
  const badgeText = read(() => {
    if (tab.muted) {
      return "muted";
    }
    return "♪";
  });
  const pinTitle = read(() => {
    if (tab.pinned) {
      return "Unpin";
    }
    return "Pin as essential";
  });

  return (
    <div
      class="nw-tab"
      title={label()}
      draggable="true"
      data-selected={attributeFlag(selected())}
      data-unloaded={attributeFlag(unloaded())}
      onClick={() => selectTab(tab)}
      onAuxClick={(event: MouseEvent) => closeOnMiddleClick(event, tab)}
      onContextMenu={(event: MouseEvent) => openTabContextMenu(event, tab)}
      onDragStart={(event: DragEvent) => startTabDrag(event, tab)}
      onDragOver={allowTabDrop}
      onDrop={(event: DragEvent) => dropTabOnto(event, tab)}
      onDragEnd={endTabDrag}
    >
      <Show when={container()}>
        {(color) => <span class="nw-container-dot" style={{ background: color() }} />}
      </Show>
      <Favicon source={favicon()} busy={busy()} />
      <span class="nw-tab-label">{label()}</span>
      <Show when={playing() || muted()}>
        <span class="nw-tab-badge">{badgeText()}</span>
      </Show>
      <button
        type="button"
        class="nw-icon-button nw-tab-action"
        title={pinTitle()}
        data-active={attributeFlag(pinned())}
        onClick={stopThen(() => togglePinned(tab))}
      >
        ⊙
      </button>
      <button
        type="button"
        class="nw-icon-button nw-tab-action"
        title="Close tab"
        onClick={stopThen(() => closeTab(tab))}
      >
        ×
      </button>
    </div>
  );
}
