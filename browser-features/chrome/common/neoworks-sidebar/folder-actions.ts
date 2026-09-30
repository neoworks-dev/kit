// SPDX-License-Identifier: MPL-2.0

// Sidebar folders are Firefox tab groups.

import { openNewTab } from "./tab-actions.ts";
import { tabbrowser } from "./tabbrowser.ts";
import type { BrowserTab, BrowserTabGroup, TabListElement } from "./types.ts";

// Firefox's tab group palette.
export const FOLDER_COLORS = [
  "blue",
  "purple",
  "cyan",
  "orange",
  "yellow",
  "pink",
  "green",
  "gray",
  "red",
];

export const DEFAULT_FOLDER_LABEL = "Folder";

export function isFolder(element: TabListElement): element is BrowserTabGroup {
  return element.localName === "tab-group";
}

function topLevelElement(tab: BrowserTab): TabListElement {
  if (tab.group) {
    return tab.group;
  }
  return tab;
}

function firstTabOf(element: TabListElement): BrowserTab {
  if (isFolder(element)) {
    return element.tabs[0];
  }
  return element;
}

// Loose tabs and folders in sidebar order; pinned and hidden tabs are left out.
export function tabListElements(): TabListElement[] {
  const elements: TabListElement[] = [];
  for (const tab of tabbrowser().nonHiddenTabs) {
    if (tab.pinned) {
      continue;
    }
    const element = topLevelElement(tab);
    if (elements[elements.length - 1] !== element) {
      elements.push(element);
    }
  }
  return elements;
}

export function visibleFolders(): BrowserTabGroup[] {
  return tabListElements().filter(isFolder);
}

export function toggleFolderCollapsed(group: BrowserTabGroup): void {
  group.collapsed = !group.collapsed;
}

export function createFolder(tab: BrowserTab): BrowserTabGroup {
  return tabbrowser().addTabGroup([tab], {
    label: DEFAULT_FOLDER_LABEL,
    insertBefore: tab,
  });
}

export function renameFolder(group: BrowserTabGroup, label: string): void {
  group.label = label;
}

export function recolorFolder(group: BrowserTabGroup, color: string): void {
  group.color = color;
}

export function openTabInFolder(group: BrowserTabGroup): void {
  group.collapsed = false;
  tabbrowser().moveTabToExistingGroup(openNewTab(), group);
}

// Deletes the folder but keeps its tabs.
export function dissolveFolder(group: BrowserTabGroup): void {
  group.ungroupTabs();
}

export function closeFolder(group: BrowserTabGroup): void {
  tabbrowser().removeTabGroup(group).catch((error: unknown) => {
    console.error("[neoworks-sidebar] Closing a folder failed:", error);
  });
}

// A pinned tab (or Essential) dropped into the list becomes a normal tab.
function unpinForList(tab: BrowserTab): void {
  if (tab.pinned) {
    tabbrowser().unpinTab(tab);
  }
}

export function moveTabIntoFolder(tab: BrowserTab, group: BrowserTabGroup): void {
  unpinForList(tab);
  tabbrowser().moveTabToExistingGroup(tab, group);
}

export function removeTabFromFolder(tab: BrowserTab): void {
  tabbrowser().ungroupTab(tab);
}

// Moves the tab out of its folder, below everything else. Not moveTabToEnd:
// for the last tab of a folder that one lands in front of the folder.
export function moveTabToListEnd(tab: BrowserTab): void {
  unpinForList(tab);
  tabbrowser().ungroupTab(tab);
  const elements = tabListElements();
  const lastElement = elements[elements.length - 1];
  if (lastElement !== tab) {
    tabbrowser().moveTabAfter(tab, lastElement);
  }
}

// Takes the target's place: after it when moving down, before it when moving up.
function moveElementOnto(element: TabListElement, target: TabListElement): void {
  if (element === target) {
    return;
  }
  if (firstTabOf(element).index < firstTabOf(target).index) {
    tabbrowser().moveTabAfter(element, target);
    return;
  }
  tabbrowser().moveTabBefore(element, target);
}

// Dropped on a tab inside another folder, the folder moves next to that folder.
export function moveFolderOnto(group: BrowserTabGroup, target: TabListElement): void {
  if (isFolder(target)) {
    moveElementOnto(group, target);
    return;
  }
  if (target.pinned) {
    return;
  }
  moveElementOnto(group, topLevelElement(target));
}

export function moveFolderToListEnd(group: BrowserTabGroup): void {
  const elements = tabListElements();
  moveElementOnto(group, elements[elements.length - 1]);
}

export function moveFolderBy(group: BrowserTabGroup, step: number): void {
  const elements = tabListElements();
  const target = elements[elements.indexOf(group) + step];
  if (!target) {
    return;
  }
  moveElementOnto(group, target);
}
