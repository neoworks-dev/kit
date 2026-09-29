// SPDX-License-Identifier: MPL-2.0

import { createEffect, For, Match, onCleanup, Show, Switch } from "solid-js";
import { createPageBackdrop } from "../neoworks-ui/page-backdrop.ts";
import { ContainerBar } from "./container-bar.tsx";
import { namedColor } from "./identity-colors.ts";
import { PinnedGrid } from "./pinned-grid.tsx";
import { openNewTab, toggleGroupCollapsed } from "./tab-actions.ts";
import {
  handleSidebarEnter,
  handleSidebarLeave,
  sidebarVisible,
} from "./sidebar-visibility.ts";
import { tabReader, TabRow } from "./tab-row.tsx";
import type {
  BrowserTab,
  BrowserTabGroup,
  SidebarEntry,
  TabState,
} from "./types.ts";
import glassStyle from "../neoworks-ui/glass.css?inline";
import iconStyle from "../neoworks-ui/icons.css?inline";
import sidebarStyle from "./sidebar.css?inline";

function GroupRow(props: { group: BrowserTabGroup; tabState: TabState }) {
  const group = props.group;
  const read = tabReader(props.tabState);

  const label = read(() => group.label || "Folder");
  const collapsed = read(() => group.collapsed);
  const color = read(() => namedColor(group.color));
  const tabs = read(() => group.tabs.filter((tab) => !tab.hidden));

  return (
    <div class="nw-group">
      <div class="nw-group-header" onClick={() => toggleGroupCollapsed(group)}>
        <span class="nw-group-chevron" data-collapsed={String(collapsed())}>›</span>
        <span class="nw-container-dot" style={{ background: color() }} />
        <span class="nw-tab-label">{label()}</span>
        <span class="nw-group-count">{tabs().length}</span>
      </div>
      <Show when={!collapsed()}>
        <div class="nw-group-tabs">
          <For each={tabs()}>
            {(tab) => <TabRow tab={tab} tabState={props.tabState} />}
          </For>
        </div>
      </Show>
    </div>
  );
}

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
        {(group) => <GroupRow group={group()} tabState={props.tabState} />}
      </Match>
    </Switch>
  );
}

function visibleFlag(): string | undefined {
  if (sidebarVisible()) {
    return "true";
  }
  return undefined;
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
    if (sidebarVisible()) {
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
        <button type="button" class="nw-icon-button" title="New tab" onClick={openNewTab}>
          <span class="nw-icon" data-icon="plus" />
        </button>
      </div>

      <div class="nw-scroll">
        <PinnedGrid tabState={props.tabState} />
        <For each={props.tabState.entries()}>
          {(entry) => <EntryRow entry={entry} tabState={props.tabState} />}
        </For>
      </div>

      <ContainerBar />
    </div>
  );
}
