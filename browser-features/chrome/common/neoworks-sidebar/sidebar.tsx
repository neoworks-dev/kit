// SPDX-License-Identifier: MPL-2.0

import { For, Match, Show, Switch } from "solid-js";
import { namedColor } from "./identity-colors.ts";
import { openNewTab, toggleGroupCollapsed } from "./tab-actions.ts";
import { TabRow } from "./tab-row.tsx";
import { toggleToolbox, toolboxHidden } from "./toolbox-visibility.ts";
import type {
  BrowserTab,
  BrowserTabGroup,
  SidebarEntry,
  TabState,
} from "./types.ts";
import sidebarStyle from "./sidebar.css?inline";

function GroupRow(props: { group: BrowserTabGroup; tabState: TabState }) {
  const group = props.group;
  const read = <T,>(getter: () => T): (() => T) => () => {
    props.tabState.revision();
    return getter();
  };

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

function toolboxButtonLabel(): string {
  if (toolboxHidden()) {
    return "Show Firefox toolbar";
  }
  return "Hide Firefox toolbar";
}

export function Sidebar(props: { tabState: TabState }) {
  return (
    <div id="neoworks-sidebar">
      <style>{sidebarStyle}</style>
      <div class="nw-header">
        <span class="nw-title">Neoworks</span>
        <button type="button" class="nw-icon-button" title="New tab" onClick={openNewTab}>
          +
        </button>
      </div>

      <div class="nw-scroll">
        <Show when={props.tabState.pinnedTabs().length > 0}>
          <div class="nw-essentials">
            <For each={props.tabState.pinnedTabs()}>
              {(tab) => <TabRow tab={tab} tabState={props.tabState} />}
            </For>
          </div>
        </Show>
        <For each={props.tabState.entries()}>
          {(entry) => <EntryRow entry={entry} tabState={props.tabState} />}
        </For>
      </div>

      <div class="nw-footer">
        <button type="button" class="nw-text-button" onClick={toggleToolbox}>
          {toolboxButtonLabel()}
        </button>
      </div>
    </div>
  );
}
