// SPDX-License-Identifier: MPL-2.0

// Kit's values on a tab (its workspace, whether it's an Essential), stored
// through SessionStore so they survive restarts. Changes are announced so
// window sync (NWWindowSync.sys.mts) copies them to the tab in other windows.

import type { BrowserTab } from "./types.ts";

// NWWindowSync's TAB_VALUES_CHANGED_EVENT.
const TAB_VALUES_CHANGED_EVENT = "NWTabValuesChanged";

interface SessionStoreApi {
  getCustomTabValue(tab: BrowserTab, key: string): string;
  setCustomTabValue(tab: BrowserTab, key: string, value: string): void;
  deleteCustomTabValue(tab: BrowserTab, key: string): void;
}

const browserWindow = window as unknown as { SessionStore: SessionStoreApi };

function announce(tab: BrowserTab): void {
  tab.dispatchEvent(new CustomEvent(TAB_VALUES_CHANGED_EVENT, { bubbles: true }));
}

export function getTabValue(tab: BrowserTab, key: string): string {
  return browserWindow.SessionStore.getCustomTabValue(tab, key);
}

export function setTabValue(tab: BrowserTab, key: string, value: string): void {
  if (getTabValue(tab, key) === value) {
    return;
  }
  browserWindow.SessionStore.setCustomTabValue(tab, key, value);
  announce(tab);
}

export function deleteTabValue(tab: BrowserTab, key: string): void {
  if (!getTabValue(tab, key)) {
    return;
  }
  browserWindow.SessionStore.deleteCustomTabValue(tab, key);
  announce(tab);
}
