// SPDX-License-Identifier: MPL-2.0

import { For, Show } from "solid-js";
import { openTabContextMenu } from "./context-menu.tsx";
import { containerColor } from "./identity-colors.ts";
import { closeOnMiddleClick, selectTab } from "./tab-actions.ts";
import {
  allowDrop,
  dropOntoTab,
  endDrag,
  isDropTarget,
  leaveDrop,
  startTabDrag,
} from "./tab-drag.ts";
import { attributeFlag, Favicon, tabReader } from "./tab-row.tsx";
import type { BrowserTab, TabState } from "./types.ts";

function PinnedTile(props: { tab: BrowserTab; tabState: TabState }) {
  const tab = props.tab;
  const read = tabReader(props.tabState);

  const label = read(() => tab.label || "New Tab");
  const favicon = read(() => tab.image);
  const selected = read(() => tab.selected);
  const busy = read(() => tab.hasAttribute("busy"));
  const unloaded = read(() => tab.hasAttribute("pending"));
  const container = read(() => containerColor(tab.userContextId));

  return (
    <div
      class="nw-pinned-tile"
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
      <Favicon source={favicon()} busy={busy()} />
      <Show when={container()}>
        {(color) => <span class="nw-pinned-container" style={{ background: color() }} />}
      </Show>
    </div>
  );
}

// Pinned tabs as a wrapping row of favicon tiles above the tab list.
export function PinnedGrid(props: { tabState: TabState }) {
  return (
    <Show when={props.tabState.pinnedTabs().length > 0}>
      <div class="nw-pinned-grid">
        <For each={props.tabState.pinnedTabs()}>
          {(tab) => <PinnedTile tab={tab} tabState={props.tabState} />}
        </For>
      </div>
    </Show>
  );
}
