// SPDX-License-Identifier: MPL-2.0

import { For, Match, Switch } from "solid-js";
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

function dockToggleTitle(): string {
  if (sidebarDocked()) {
    return "Collapse sidebar";
  }
  return "Keep sidebar open";
}

// The layer spans the window's left edge: collapsed, a thin hover strip
// reveals the sidebar, which slides over the page instead of taking space.
export function Sidebar(props: { tabState: TabState }) {
  return (
    <div id="neoworks-sidebar-layer">
      <style>{glassStyle + iconStyle + sidebarStyle}</style>
      <div class="nw-reveal-edge" onMouseEnter={handleSidebarEnter} />
      <SidebarPanel tabState={props.tabState} />
    </div>
  );
}

function SidebarPanel(props: { tabState: TabState }) {
  return (
    <div
      id="neoworks-sidebar"
      data-visible={visibleFlag()}
      onMouseEnter={handleSidebarEnter}
      onMouseLeave={handleSidebarLeave}
    >
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
