// SPDX-License-Identifier: MPL-2.0

// Firefox treats pinned tabs as "app tabs": a link to another site opens in a
// new tab instead of leaving the pinned page. In Kit, pinned tabs and
// Essentials browse like any other tab. Gecko reads the browsing context's
// isAppTab flag, which Firefox sets whenever a tab is pinned or gets a new
// browser, so it is cleared again after each. Loads started from the chrome
// (bookmarks, the search bar) are handled in NoranekoStartup.sys.mts.

import { tabbrowser } from "./tabbrowser.ts";
import type { BrowserTab } from "./types.ts";

// Firefox sets the flag before dispatching these.
const APP_TAB_EVENTS = ["TabPinned", "TabBrowserInserted"];

function clearAppTab(tab: BrowserTab): void {
  const browsingContext = tab.linkedBrowser.browsingContext;
  if (browsingContext) {
    browsingContext.isAppTab = false;
  }
}

function handleAppTabEvent(event: Event): void {
  clearAppTab(event.target as unknown as BrowserTab);
}

// Returns a stop function for hot reload.
export function browseInPinnedTabs(): () => void {
  const tabContainer = tabbrowser().tabContainer;
  for (const eventName of APP_TAB_EVENTS) {
    tabContainer.addEventListener(eventName, handleAppTabEvent);
  }
  for (const tab of tabbrowser().tabs) {
    if (tab.pinned) {
      clearAppTab(tab);
    }
  }
  return () => {
    for (const eventName of APP_TAB_EVENTS) {
      tabContainer.removeEventListener(eventName, handleAppTabEvent);
    }
  };
}
