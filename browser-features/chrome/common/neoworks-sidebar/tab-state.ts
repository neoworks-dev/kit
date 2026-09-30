// SPDX-License-Identifier: MPL-2.0

import { createSignal } from "solid-js";
import { isEssential } from "./essentials.ts";
import { tabbrowser } from "./tabbrowser.ts";
import type {
  BrowserTab,
  BrowserTabGroup,
  SidebarEntry,
  TabState,
} from "./types.ts";

const TAB_EVENTS = [
  "TabOpen",
  "TabClose",
  "TabSelect",
  "TabMove",
  "TabAttrModified",
  "TabPinned",
  "TabUnpinned",
  "TabShow",
  "TabHide",
  "TabGrouped",
  "TabUngrouped",
  "TabGroupCreate",
  "TabGroupRemoved",
  "TabGroupCollapse",
  "TabGroupExpand",
  "TabGroupUpdate",
];

// Entry objects are cached so <For> keeps existing rows instead of
// re-creating every row on each tab event.
const tabEntries = new WeakMap<BrowserTab, SidebarEntry>();
const groupEntries = new WeakMap<BrowserTabGroup, SidebarEntry>();

function entryForTab(tab: BrowserTab): SidebarEntry {
  let entry = tabEntries.get(tab);
  if (!entry) {
    entry = { kind: "tab", tab };
    tabEntries.set(tab, entry);
  }
  return entry;
}

function entryForGroup(group: BrowserTabGroup): SidebarEntry {
  let entry = groupEntries.get(group);
  if (!entry) {
    entry = { kind: "group", group };
    groupEntries.set(group, entry);
  }
  return entry;
}

function buildEntries(tabs: BrowserTab[]): SidebarEntry[] {
  const entries: SidebarEntry[] = [];
  const seenGroups = new Set<BrowserTabGroup>();
  for (const tab of tabs) {
    if (tab.pinned) {
      continue;
    }
    if (!tab.group) {
      entries.push(entryForTab(tab));
      continue;
    }
    if (seenGroups.has(tab.group)) {
      continue;
    }
    seenGroups.add(tab.group);
    entries.push(entryForGroup(tab.group));
  }
  return entries;
}

export function createTabState(): TabState {
  const [essentialTabs, setEssentialTabs] = createSignal<BrowserTab[]>([]);
  const [pinnedTabs, setPinnedTabs] = createSignal<BrowserTab[]>([]);
  const [entries, setEntries] = createSignal<SidebarEntry[]>([]);
  const [revision, setRevision] = createSignal(0);
  let refreshQueued = false;

  function refresh(): void {
    refreshQueued = false;
    const tabs = tabbrowser().nonHiddenTabs;
    const pinned = tabs.filter((tab) => tab.pinned);
    setEssentialTabs(pinned.filter(isEssential));
    setPinnedTabs(pinned.filter((tab) => !isEssential(tab)));
    setEntries(buildEntries(tabs));
    setRevision((value) => value + 1);
  }

  // Several tab events fire per user action; coalesce them into one refresh.
  function queueRefresh(): void {
    if (refreshQueued) {
      return;
    }
    refreshQueued = true;
    queueMicrotask(refresh);
  }

  const tabContainer = tabbrowser().tabContainer;
  for (const eventName of TAB_EVENTS) {
    tabContainer.addEventListener(eventName, queueRefresh);
  }
  refresh();

  function dispose(): void {
    for (const eventName of TAB_EVENTS) {
      tabContainer.removeEventListener(eventName, queueRefresh);
    }
  }

  return { essentialTabs, pinnedTabs, entries, revision, dispose };
}
