// SPDX-License-Identifier: MPL-2.0

import { createEffect, For, Match, onCleanup, Switch } from "solid-js";
import { createPageBackdrop } from "../neoworks-ui/page-backdrop.ts";
import { ContainerBar } from "./container-bar.tsx";
import { SidebarDownloadsButton } from "../neoworks-downloads/sidebar-downloads-button.tsx";
import { FolderRow } from "./folder-row.tsx";
import { MediaControls } from "./media-controls.tsx";
import { PinnedGrid } from "./pinned-grid.tsx";
import { openSidebarContextMenu } from "./sidebar-context-menu.tsx";
import { sidebarDocked, toggleSidebarDocked } from "./sidebar-docking.ts";
import { openNewTab } from "./tab-actions.ts";
import {
  allowDrop,
  dropAtListEnd,
  isDropTarget,
  leaveDrop,
  LIST_END,
} from "./tab-drag.ts";
import {
  handleSidebarEnter,
  handleSidebarLeave,
  sidebarVisible,
} from "./sidebar-visibility.ts";
import { attributeFlag, TabRow } from "./tab-row.tsx";
import { WorkspaceSwitcher } from "./workspace-switcher.tsx";
import { activeWorkspace } from "./workspaces.ts";
import type {
  BrowserTab,
  BrowserTabGroup,
  SidebarEntry,
  TabState,
} from "./types.ts";
import glassStyle from "../neoworks-ui/glass.css?inline";
import iconStyle from "../neoworks-ui/icons.css?inline";
import sidebarStyle from "./sidebar.css?inline";

function tabOfEntry(entry: SidebarEntry): BrowserTab | undefined {
  if (entry.kind === "tab") {
    return entry.tab;
  }
  return undefined;
}

function groupOfEntry(entry: SidebarEntry): BrowserTabGroup | undefined {
  if (entry.kind === "group") {
    return entry.group;
  }
  return undefined;
}

function EntryRow(props: { entry: SidebarEntry; tabState: TabState }) {
  return (
    <Switch>
      <Match when={tabOfEntry(props.entry)}>
        {(tab) => <TabRow tab={tab()} tabState={props.tabState} />}
      </Match>
      <Match when={groupOfEntry(props.entry)}>
        {(group) => <FolderRow group={group()} tabState={props.tabState} />}
      </Match>
    </Switch>
  );
}

function NewTabRow() {
  return (
    <div class="nw-tab nw-new-tab" onClick={openNewTab}>
      <span class="nw-favicon">
        <span class="nw-icon" data-icon="plus" />
      </span>
      <span class="nw-tab-label">New tab</span>
    </div>
  );
}

// Fills the space below the last row; a tab dropped here leaves its folder.
function ListEndDropZone() {
  return (
    <div
      class="nw-drop-end"
      data-drop-target={attributeFlag(isDropTarget(LIST_END))}
      onDragOver={(event: DragEvent) => allowDrop(event, LIST_END)}
      onDragLeave={() => leaveDrop(LIST_END)}
      onDrop={dropAtListEnd}
    />
  );
}

function isShown(): boolean {
  return sidebarDocked() || sidebarVisible();
}

function visibleFlag(): string | undefined {
  if (isShown()) {
    return "true";
  }
  return undefined;
}

// Docked, the sidebar sits over the window glass, not the page, so there is
// no page region to snapshot.
function needsPageBackdrop(): boolean {
  return !sidebarDocked() && sidebarVisible();
}

function dockToggleTitle(): string {
  if (sidebarDocked()) {
    return "Float sidebar over page";
  }
  return "Dock sidebar";
}

// The layer spans the content area's left edge: a thin hover strip reveals the
// floating sidebar, which slides over the page instead of taking space.
export function Sidebar(props: { tabState: TabState }) {
  return (
    <div id="neoworks-sidebar-layer">
      <style>{glassStyle + iconStyle + sidebarStyle}</style>
      <div class="nw-reveal-edge" onMouseEnter={handleSidebarEnter} />
      <SidebarPanel tabState={props.tabState} />
    </div>
  );
}

const SIDEBAR_ID = "neoworks-sidebar";
const SIDEBAR_BACKDROP_ID = "neoworks-sidebar-backdrop";

function SidebarPanel(props: { tabState: TabState }) {
  const backdrop = createPageBackdrop(SIDEBAR_ID, SIDEBAR_BACKDROP_ID);
  createEffect(() => {
    if (needsPageBackdrop()) {
      backdrop.start();
      return;
    }
    backdrop.stop();
  });
  onCleanup(() => backdrop.stop());

  return (
    <div
      id={SIDEBAR_ID}
      class="nw-glass"
      data-visible={visibleFlag()}
      onMouseEnter={handleSidebarEnter}
      onMouseLeave={handleSidebarLeave}
    >
      <canvas id={SIDEBAR_BACKDROP_ID} class="nw-glass-backdrop" />
      <div class="nw-header">
        <span class="nw-workspace-name">{activeWorkspace().name}</span>
        <ContainerBar />
        <button
          type="button"
          class="nw-icon-button"
          title={dockToggleTitle()}
          onClick={toggleSidebarDocked}
        >
          <span class="nw-icon" data-icon="sidebar-simple" />
        </button>
      </div>

      <div class="nw-scroll" onContextMenu={openSidebarContextMenu}>
        <PinnedGrid tabState={props.tabState} />
        <For each={props.tabState.entries()}>
          {(entry) => <EntryRow entry={entry} tabState={props.tabState} />}
        </For>
        <NewTabRow />
        <ListEndDropZone />
      </div>

      <MediaControls tabState={props.tabState} />
      <div class="nw-sidebar-footer">
        <SidebarDownloadsButton />
        <WorkspaceSwitcher />
      </div>
    </div>
  );
}
