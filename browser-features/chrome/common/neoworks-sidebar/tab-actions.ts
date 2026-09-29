// SPDX-License-Identifier: MPL-2.0

import { tabbrowser } from "./tabbrowser.ts";
import type { BrowserTab, BrowserTabGroup } from "./types.ts";

const MIDDLE_MOUSE_BUTTON = 1;

export function selectTab(tab: BrowserTab): void {
  tabbrowser().selectedTab = tab;
}

export function closeTab(tab: BrowserTab): void {
  tabbrowser().removeTab(tab, { animate: false });
}

export function openNewTab(): void {
  const browserWindow = window as unknown as {
    BrowserCommands: { openTab(): void };
  };
  browserWindow.BrowserCommands.openTab();
}

export function togglePinned(tab: BrowserTab): void {
  if (tab.pinned) {
    tabbrowser().unpinTab(tab);
    return;
  }
  tabbrowser().pinTab(tab);
}

export function toggleGroupCollapsed(group: BrowserTabGroup): void {
  group.collapsed = !group.collapsed;
}

export function createGroupFromTab(tab: BrowserTab): void {
  tabbrowser().addTabGroup([tab], { label: "Folder", insertBefore: tab });
}

export function closeOnMiddleClick(event: MouseEvent, tab: BrowserTab): void {
  if (event.button !== MIDDLE_MOUSE_BUTTON) {
    return;
  }
  event.preventDefault();
  closeTab(tab);
}

// Moves `draggedTab` to `targetTab`'s position and into (or out of) the
// target's folder, mirroring Neoworks' drop-on-row behavior.
export function moveTabOnto(draggedTab: BrowserTab, targetTab: BrowserTab): void {
  if (draggedTab === targetTab || draggedTab.pinned !== targetTab.pinned) {
    return;
  }
  const browser = tabbrowser();
  if (targetTab.group && targetTab.group !== draggedTab.group) {
    browser.moveTabToExistingGroup(draggedTab, targetTab.group);
  }
  if (!targetTab.group && draggedTab.group) {
    browser.ungroupTab(draggedTab);
  }
  browser.moveTabTo(draggedTab, { tabIndex: browser.tabs.indexOf(targetTab) });
}
