// SPDX-License-Identifier: MPL-2.0

// Essentials: up to nine sites you always keep open, shown as large tiles at
// the top of the sidebar in every workspace. An Essential is a pinned tab
// with a flag stored through SessionStore, so it survives restarts; unpinning
// it drops the flag.

import { tabbrowser } from "./tabbrowser.ts";
import { claimForActiveWorkspace } from "./workspaces.ts";
import type { BrowserTab } from "./types.ts";

export const MAX_ESSENTIALS = 9;

const ESSENTIAL_KEY = "neoworksEssential";

interface SessionStoreApi {
  getCustomTabValue(tab: BrowserTab, key: string): string;
  setCustomTabValue(tab: BrowserTab, key: string, value: string): void;
  deleteCustomTabValue(tab: BrowserTab, key: string): void;
}

const browserWindow = window as unknown as { SessionStore: SessionStoreApi };

export function isEssential(tab: BrowserTab): boolean {
  return browserWindow.SessionStore.getCustomTabValue(tab, ESSENTIAL_KEY) === "true";
}

export function essentialTabs(): BrowserTab[] {
  return tabbrowser().tabs.filter(isEssential);
}

// The sidebar re-reads tabs on TabAttrModified.
function announceChange(tab: BrowserTab): void {
  tab.dispatchEvent(
    new CustomEvent("TabAttrModified", {
      bubbles: true,
      detail: { changed: ["nw-essential"] },
    }),
  );
}

// Returns false when the grid is already full.
export function addToEssentials(tab: BrowserTab): boolean {
  if (isEssential(tab)) {
    return true;
  }
  if (essentialTabs().length >= MAX_ESSENTIALS) {
    return false;
  }
  browserWindow.SessionStore.setCustomTabValue(tab, ESSENTIAL_KEY, "true");
  if (!tab.pinned) {
    tabbrowser().pinTab(tab);
  }
  announceChange(tab);
  return true;
}

// The tab stays pinned, in the workspace you're in.
export function removeFromEssentials(tab: BrowserTab): void {
  if (!isEssential(tab)) {
    return;
  }
  browserWindow.SessionStore.deleteCustomTabValue(tab, ESSENTIAL_KEY);
  claimForActiveWorkspace(tab);
  announceChange(tab);
}

function handleUnpinned(event: Event): void {
  removeFromEssentials(event.target as unknown as BrowserTab);
}

// Returns a stop function for hot reload.
export function watchEssentials(): () => void {
  const tabContainer = tabbrowser().tabContainer;
  tabContainer.addEventListener("TabUnpinned", handleUnpinned);
  return () => tabContainer.removeEventListener("TabUnpinned", handleUnpinned);
}
