// SPDX-License-Identifier: MPL-2.0

import { defaultContainerId } from "./containers.ts";
import { addToEssentials, isEssential, removeFromEssentials } from "./essentials.ts";
import { tabbrowser } from "./tabbrowser.ts";
import type { BrowserTab } from "./types.ts";

const MIDDLE_MOUSE_BUTTON = 1;

const browserWindow = window as unknown as { BROWSER_NEW_TAB_URL: string };

export function selectTab(tab: BrowserTab): void {
  tabbrowser().selectedTab = tab;
}

export function closeTab(tab: BrowserTab): void {
  tabbrowser().removeTab(tab, { animate: false });
}

// New tabs open in the default container and take keyboard focus, so the
// page keys work right away.
export function openNewTab(): BrowserTab {
  const browser = tabbrowser();
  const tab = browser.addTrustedTab(browserWindow.BROWSER_NEW_TAB_URL, {
    userContextId: defaultContainerId(),
  });
  browser.selectedTab = tab;
  browser.selectedBrowser.focus();
  return tab;
}

// A tab can't change container in place: reopen its page in the target
// container at the same position, then close the original.
export function moveTabToContainer(tab: BrowserTab, userContextId: number): void {
  if (tab.userContextId === userContextId) {
    return;
  }
  const browser = tabbrowser();
  const replacement = browser.addTrustedTab(tab.linkedBrowser.currentURI.spec, {
    userContextId,
    pinned: tab.pinned,
    index: tab.index + 1,
  });
  if (tab.selected) {
    browser.selectedTab = replacement;
  }
  closeTab(tab);
}

// A pending tab keeps its browser but hasn't loaded its page yet.
export function isUnloaded(tab: BrowserTab): boolean {
  return !tab.linkedPanel || tab.hasAttribute("pending");
}

export function unloadTabs(tabs: BrowserTab[]): void {
  const loaded = tabs.filter((tab) => !tab.closing && !isUnloaded(tab));
  if (loaded.length === 0) {
    return;
  }
  tabbrowser().explicitUnloadTabs(loaded).catch((error: unknown) => {
    console.error("[neoworks-sidebar] Unloading tabs failed:", error);
  });
}

// Every other tab in the current workspace, Essentials included.
export function unloadOtherTabs(tab: BrowserTab): void {
  unloadTabs(tabbrowser().nonHiddenTabs.filter((other) => other !== tab));
}

export function togglePinned(tab: BrowserTab): void {
  if (tab.pinned) {
    tabbrowser().unpinTab(tab);
    return;
  }
  tabbrowser().pinTab(tab);
}

export function closeOnMiddleClick(event: MouseEvent, tab: BrowserTab): void {
  if (event.button !== MIDDLE_MOUSE_BUTTON) {
    return;
  }
  event.preventDefault();
  closeTab(tab);
}

// Gives `tab` the target's section: Essentials, pinned or the tab list.
// False when the Essentials are full.
function joinSectionOf(tab: BrowserTab, target: BrowserTab): boolean {
  const browser = tabbrowser();
  if (isEssential(target)) {
    return addToEssentials(tab);
  }
  removeFromEssentials(tab);
  if (target.pinned && !tab.pinned) {
    browser.pinTab(tab);
  }
  if (!target.pinned && tab.pinned) {
    browser.unpinTab(tab);
  }
  return true;
}

export function pinTab(tab: BrowserTab): void {
  removeFromEssentials(tab);
  if (!tab.pinned) {
    tabbrowser().pinTab(tab);
  }
}

// Moves `draggedTab` to `targetTab`'s position and into (or out of) the
// target's folder and section, mirroring Neoworks' drop-on-row behavior.
export function moveTabOnto(draggedTab: BrowserTab, targetTab: BrowserTab): void {
  if (draggedTab === targetTab || !joinSectionOf(draggedTab, targetTab)) {
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
