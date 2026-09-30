// SPDX-License-Identifier: MPL-2.0

// The top of the sidebar: Essentials as a 3×3 grid of large tiles (shared by
// every workspace), the workspace's pinned tabs as ordinary tab rows, and a
// divider before the tab list.

import { For, Show } from "solid-js";
import { openTabContextMenu } from "./context-menu.tsx";
import { MAX_ESSENTIALS } from "./essentials.ts";
import { foreignContainerColor } from "./identity-colors.ts";
import { closeOnMiddleClick, selectTab } from "./tab-actions.ts";
import {
  allowDrop,
  allowGridDrop,
  draggingTab,
  dropIntoGrid,
  dropOntoTab,
  endDrag,
  ESSENTIALS,
  isDropTarget,
  leaveDrop,
  PINNED,
  startTabDrag,
} from "./tab-drag.ts";
import { attributeFlag, Favicon, tabIcon, tabReader, TabRow } from "./tab-row.tsx";
import { hoverTab, unhoverTab } from "./tab-preview.ts";
import type { BrowserTab, TabState } from "./types.ts";

type Grid = typeof ESSENTIALS | typeof PINNED;

function Tile(props: { tab: BrowserTab; tabState: TabState; class: string }) {
  const tab = props.tab;
  const read = tabReader(props.tabState);

  const favicon = read(() => tabIcon(tab));
  const selected = read(() => tab.selected);
  const busy = read(() => tab.hasAttribute("busy"));
  const unloaded = read(() => tab.hasAttribute("pending"));
  const container = read(() => foreignContainerColor(tab.userContextId));

  return (
    <div
      class={props.class}
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
      <Favicon source={favicon()} busy={busy()} />
      <Show when={container()}>
        {(color) => <span class="nw-pinned-container" style={{ background: color() }} />}
      </Show>
    </div>
  );
}

// Drops between tiles land on the grid itself; tiles handle their own.
function gridHandlers(grid: Grid) {
  const onGrid = (event: DragEvent) => event.target === event.currentTarget;
  return {
    onDragOver: (event: DragEvent) => {
      if (onGrid(event)) {
        allowGridDrop(event, grid);
      }
    },
    onDragLeave: () => leaveDrop(grid),
    onDrop: (event: DragEvent) => {
      if (onGrid(event)) {
        dropIntoGrid(event, grid);
      }
    },
  };
}

// An empty grid only shows up while a tab is dragged, as a place to drop it.
function DropHint(props: { grid: Grid; label: string }) {
  return (
    <div
      class="nw-grid-drop-hint"
      data-drop-target={attributeFlag(isDropTarget(props.grid))}
      onDragOver={(event: DragEvent) => allowGridDrop(event, props.grid)}
      onDragLeave={() => leaveDrop(props.grid)}
      onDrop={(event: DragEvent) => dropIntoGrid(event, props.grid)}
    >
      {props.label}
    </div>
  );
}

function EssentialsGrid(props: { tabState: TabState }) {
  const handlers = gridHandlers(ESSENTIALS);
  const tabs = () => props.tabState.essentialTabs();
  return (
    <Show
      when={tabs().length > 0}
      fallback={
        <Show when={draggingTab()}>
          <DropHint grid={ESSENTIALS} label="Drop to add to Essentials" />
        </Show>
      }
    >
      <div
        class="nw-essentials-grid"
        data-drop-target={attributeFlag(
          isDropTarget(ESSENTIALS) && tabs().length < MAX_ESSENTIALS,
        )}
        onDragOver={handlers.onDragOver}
        onDragLeave={handlers.onDragLeave}
        onDrop={handlers.onDrop}
      >
        <For each={tabs()}>
          {(tab) => <Tile tab={tab} tabState={props.tabState} class="nw-essential-tile" />}
        </For>
      </div>
    </Show>
  );
}

function PinnedRow(props: { tabState: TabState }) {
  const handlers = gridHandlers(PINNED);
  return (
    <Show
      when={props.tabState.pinnedTabs().length > 0}
      fallback={
        <Show when={draggingTab()}>
          <DropHint grid={PINNED} label="Drop to pin" />
        </Show>
      }
    >
      <div
        class="nw-pinned-list"
        data-drop-target={attributeFlag(isDropTarget(PINNED))}
        onDragOver={handlers.onDragOver}
        onDragLeave={handlers.onDragLeave}
        onDrop={handlers.onDrop}
      >
        <For each={props.tabState.pinnedTabs()}>
          {(tab) => <TabRow tab={tab} tabState={props.tabState} />}
        </For>
      </div>
    </Show>
  );
}

export function PinnedGrid(props: { tabState: TabState }) {
  const hasTopTabs = () =>
    props.tabState.essentialTabs().length > 0 || props.tabState.pinnedTabs().length > 0;
  return (
    <>
      <EssentialsGrid tabState={props.tabState} />
      <PinnedRow tabState={props.tabState} />
      <Show when={hasTopTabs()}>
        <hr class="nw-tabs-divider" />
      </Show>
    </>
  );
}
