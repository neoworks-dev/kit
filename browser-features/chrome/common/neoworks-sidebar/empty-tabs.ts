// SPDX-License-Identifier: MPL-2.0

// A new tab you leave without using is closed, so blank "New Tab" rows don't
// pile up in the sidebar. It skips the session store: there is nothing worth
// bringing back from Recently closed.

import { isEssential } from "./essentials.ts";
import { isNewTabPage } from "./new-tab-container.ts";
import { tabbrowser } from "./tabbrowser.ts";
import type { BrowserTab, TabSelectEvent } from "./types.ts";

// Folders and splits are arranged on purpose; a blank tab there stays.
function isUntouchedNewTab(tab: BrowserTab): boolean {
  if (tab.closing || tab.pinned || tab.group || tab.splitview || isEssential(tab)) {
    return false;
  }
  const browser = tab.linkedBrowser;
  if (browser.canGoBack || browser.canGoForward) {
    return false;
  }
  return isNewTabPage(browser.currentURI?.spec ?? "") && !tab.hasAttribute("busy");
}

function closeLeftNewTab(event: Event): void {
  const previousTab = (event as TabSelectEvent).detail?.previousTab;
  if (!previousTab || !isUntouchedNewTab(previousTab)) {
    return;
  }
  // Not from inside the TabSelect dispatch.
  queueMicrotask(() => {
    if (!previousTab.selected && isUntouchedNewTab(previousTab)) {
      tabbrowser().removeTab(previousTab, { animate: false, skipSessionStore: true });
    }
  });
}

// Returns a stop function for hot reload.
export function closeLeftNewTabs(): () => void {
  const tabContainer = tabbrowser().tabContainer;
  tabContainer.addEventListener("TabSelect", closeLeftNewTab);
  return () => tabContainer.removeEventListener("TabSelect", closeLeftNewTab);
}
