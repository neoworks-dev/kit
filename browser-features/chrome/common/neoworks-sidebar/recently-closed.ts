// SPDX-License-Identifier: MPL-2.0

// The sidebar's Recently closed list: the active workspace's most recently
// closed tabs, read from SessionStore. Whether the list is folded away lives
// in a pref.

import { createSignal } from "solid-js";
import { isNewTabPage } from "./new-tab-container.ts";
import { activeWorkspaceId, isInActiveWorkspace } from "./workspaces.ts";
import type { ClosedTab } from "./types.ts";

const COLLAPSED_PREF = "neoworks.sidebar.recentlyClosed.collapsed";
const CLOSED_OBJECTS_TOPIC = "sessionstore-closed-objects-changed";
const MAX_SHOWN = 5;

interface ClosedTabData {
  closedId: number;
  title: string;
  image: string | null;
  state: {
    entries: { url: string; title?: string }[];
    // 1-based; 0 when the tab had no history.
    index: number;
    extData?: Record<string, string>;
  };
}

interface SessionStoreApi {
  getClosedTabDataForWindow(window: Window): ClosedTabData[];
  undoCloseById(closedId: number, includePrivate: boolean, targetWindow: Window): unknown;
}

const browserWindow = window as unknown as { SessionStore: SessionStoreApi };

function urlOf(data: ClosedTabData): string {
  const entries = data.state.entries;
  const entry = entries[data.state.index - 1] ?? entries[entries.length - 1];
  return entry?.url ?? "";
}

function toClosedTab(data: ClosedTabData): ClosedTab {
  const url = urlOf(data);
  return { closedId: data.closedId, title: data.title || url, url, image: data.image ?? "" };
}

// A blank tab isn't worth bringing back.
function isWorthReopening(tab: ClosedTab): boolean {
  return tab.url !== "" && tab.url !== "about:blank" && !isNewTabPage(tab.url);
}

function readClosedTabs(): ClosedTab[] {
  // Reading the active workspace makes the list follow workspace switches.
  activeWorkspaceId();
  try {
    return browserWindow.SessionStore.getClosedTabDataForWindow(window)
      .filter((data) => isInActiveWorkspace(data.state.extData))
      .map(toClosedTab)
      .filter(isWorthReopening)
      .slice(0, MAX_SHOWN);
  } catch (error) {
    // Windows SessionStore doesn't track, e.g. before it has initialized.
    console.error("[neoworks-sidebar] Couldn't read recently closed tabs:", error);
    return [];
  }
}

const [revision, setRevision] = createSignal(0);
const [collapsed, setCollapsed] = createSignal(
  Services.prefs.getBoolPref(COLLAPSED_PREF, false),
);

export function closedTabs(): ClosedTab[] {
  revision();
  return readClosedTabs();
}

export const recentlyClosedCollapsed = collapsed;

export function toggleRecentlyClosed(): void {
  Services.prefs.setBoolPref(COLLAPSED_PREF, !collapsed());
}

export function reopenClosedTab(tab: ClosedTab): void {
  browserWindow.SessionStore.undoCloseById(tab.closedId, false, window);
}

// Returns a stop function for hot reload.
export function watchRecentlyClosed(): () => void {
  const closedObserver = { observe: () => setRevision((value) => value + 1) };
  const prefObserver = {
    observe: () => setCollapsed(Services.prefs.getBoolPref(COLLAPSED_PREF, false)),
  };
  Services.obs.addObserver(closedObserver, CLOSED_OBJECTS_TOPIC);
  Services.prefs.addObserver(COLLAPSED_PREF, prefObserver);
  setRevision((value) => value + 1);
  return () => {
    Services.obs.removeObserver(closedObserver, CLOSED_OBJECTS_TOPIC);
    Services.prefs.removeObserver(COLLAPSED_PREF, prefObserver);
  };
}
