// SPDX-License-Identifier: MPL-2.0

import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import { panelBrowser } from "./panel-browsers.ts";
import { addPanel, removePanel, showPanel } from "./store.ts";
import type { WebPanel } from "./types.ts";

function isWebUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

// Pins the selected tab's page and opens it as a panel.
export function pinCurrentPage(): void {
  const url = tabbrowser().selectedBrowser.currentURI.spec;
  if (!isWebUrl(url)) {
    return;
  }
  showPanel(addPanel(url));
}

export function canPinCurrentPage(): boolean {
  return isWebUrl(tabbrowser().selectedBrowser.currentURI.spec);
}

// The pref observer (store.ts) closes its page in every window.
export function unpinPanel(panel: WebPanel): void {
  removePanel(panel.id);
}

// The page as it is now, in a new tab next to the current one.
export function openPanelAsTab(panel: WebPanel): void {
  const url = panelBrowser(panel.id)?.currentURI.spec ?? panel.url;
  const browser = gBrowser as unknown as {
    tabs: unknown[];
    selectedTab: unknown;
    addTrustedTab(url: string, options: { index: number }): unknown;
  };
  browser.selectedTab = browser.addTrustedTab(url, {
    index: browser.tabs.indexOf(browser.selectedTab) + 1,
  });
}

export function goBackInPanel(panel: WebPanel): void {
  const browser = panelBrowser(panel.id);
  if (browser?.canGoBack) {
    browser.goBack();
  }
}
