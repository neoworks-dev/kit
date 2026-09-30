// SPDX-License-Identifier: MPL-2.0

// Auto-archive: tabs left unused for longer than the neoworks.tabs.archiveAfterHours
// pref are closed and kept in Kit's archive (NWTabArchive.sys.mts), where
// the spotlight finds them. Pinned tabs, Essentials, the selected tab, split
// view panes and tabs playing sound stay. Tabs in other workspaces count
// too: they go unused while you work elsewhere.

import { createSignal } from "solid-js";
import { isEssential } from "./essentials.ts";
import { isNewTabPage } from "./new-tab-container.ts";
import { tabbrowser } from "./tabbrowser.ts";
import type { ArchivedTab, BrowserTab, TabArchiveModule } from "./types.ts";

// 0 turns archiving off. Kit's settings pane offers 12 hours to 7 days.
const ARCHIVE_AFTER_PREF = "neoworks.tabs.archiveAfterHours";
const DEFAULT_ARCHIVE_AFTER_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
// Lets session restore finish before the first sweep.
const FIRST_SWEEP_DELAY_MS = 60 * 1000;

const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
) as { PrivateBrowsingUtils: { isWindowPrivate(window: Window): boolean } };

// SessionStore collects a tab's history lazily; flushing brings it up to date.
const { TabStateFlusher } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/TabStateFlusher.sys.mjs",
) as { TabStateFlusher: { flush(browser: BrowserTab["linkedBrowser"]): Promise<void> } };

interface SessionStoreApi {
  getTabState(tab: BrowserTab): string;
  setTabState(tab: BrowserTab, state: string): void;
}

const browserWindow = window as unknown as { SessionStore: SessionStoreApi };

function tabArchive(): TabArchiveModule {
  return ChromeUtils.importESModule(
    "resource://noraneko/modules/NWTabArchive.sys.mjs",
  ) as TabArchiveModule;
}

const [archived, setArchived] = createSignal<ArchivedTab[]>([]);

// Newest first.
export { archived as archivedTabs };

function archiveAfterHours(): number {
  return Services.prefs.getIntPref(ARCHIVE_AFTER_PREF, DEFAULT_ARCHIVE_AFTER_HOURS);
}

function isStale(tab: BrowserTab, cutoff: number): boolean {
  return !tab.pinned && !tab.selected && !tab.closing && !tab.splitview &&
    !isEssential(tab) && !tab.hasAttribute("soundplaying") && tab.lastAccessed < cutoff;
}

function toArchivedTab(tab: BrowserTab): ArchivedTab {
  const url = tab.linkedBrowser.currentURI.spec;
  return {
    id: crypto.randomUUID(),
    title: tab.label || url,
    url,
    image: tab.image ?? "",
    archivedAt: Date.now(),
    state: browserWindow.SessionStore.getTabState(tab),
  };
}

function isBlank(tab: BrowserTab): boolean {
  const url = tab.linkedBrowser.currentURI.spec;
  return url === "about:blank" || isNewTabPage(url);
}

// Blank tabs aren't worth keeping; they are just closed. Archived tabs skip
// SessionStore's recently closed list, which they would otherwise flood.
async function sweep(): Promise<void> {
  const hours = archiveAfterHours();
  if (hours <= 0) {
    return;
  }
  const browser = tabbrowser();
  const stale = browser.tabs.filter((tab) => isStale(tab, Date.now() - hours * HOUR_MS));
  if (stale.length === 0) {
    return;
  }
  const worthKeeping = stale.filter((tab) => !isBlank(tab));
  await Promise.all(worthKeeping.map((tab) => TabStateFlusher.flush(tab.linkedBrowser)));
  const kept = worthKeeping.filter((tab) => !tab.closing && tab.isConnected).map(toArchivedTab);
  await tabArchive().archive(kept);
  for (const tab of stale) {
    if (!tab.closing && tab.isConnected) {
      browser.removeTab(tab, { animate: false, skipSessionStore: true });
    }
  }
}

function sweepSafely(): void {
  sweep().catch((error) => console.error("[neoworks-sidebar] Tab archiving failed:", error));
}

interface StoredTabState {
  userContextId?: number;
  entries?: unknown[];
}

function parseState(entry: ArchivedTab): StoredTabState {
  try {
    return JSON.parse(entry.state) as StoredTabState;
  } catch {
    return {};
  }
}

function restoreState(entry: ArchivedTab, state: StoredTabState): BrowserTab | null {
  if (!state.entries?.length) {
    return null;
  }
  const browser = tabbrowser();
  const tab = browser.addTrustedTab("about:blank", { userContextId: state.userContextId ?? 0 });
  try {
    browserWindow.SessionStore.setTabState(tab, entry.state);
    return tab;
  } catch (error) {
    console.error("[neoworks-sidebar] Couldn't restore the archived tab:", error);
    browser.removeTab(tab, { animate: false, skipSessionStore: true });
    return null;
  }
}

// Back as a tab with its history, in the workspace it was archived from.
export function reopenArchivedTab(entry: ArchivedTab): void {
  const browser = tabbrowser();
  const state = parseState(entry);
  const userContextId = state.userContextId ?? 0;
  // Without its state the page still opens, only without its history.
  const tab = restoreState(entry, state) ??
    browser.addTrustedTab(entry.url, { userContextId });
  browser.selectedTab = tab;
  tabArchive().remove(entry.id).catch((error) =>
    console.error("[neoworks-sidebar] Couldn't update the tab archive:", error)
  );
}

// Returns a stop function for hot reload.
export function watchTabArchive(): () => void {
  const archive = tabArchive();
  const changeObserver = { observe: () => setArchived(archive.archivedTabs()) };
  Services.obs.addObserver(changeObserver, archive.TAB_ARCHIVE_CHANGED_TOPIC);
  archive.ready().then(() => setArchived(archive.archivedTabs()));
  if (PrivateBrowsingUtils.isWindowPrivate(window)) {
    return () => Services.obs.removeObserver(changeObserver, archive.TAB_ARCHIVE_CHANGED_TOPIC);
  }
  const prefObserver = { observe: sweepSafely };
  Services.prefs.addObserver(ARCHIVE_AFTER_PREF, prefObserver);
  const firstSweep = setTimeout(sweepSafely, FIRST_SWEEP_DELAY_MS);
  const interval = setInterval(sweepSafely, SWEEP_INTERVAL_MS);
  return () => {
    Services.obs.removeObserver(changeObserver, archive.TAB_ARCHIVE_CHANGED_TOPIC);
    Services.prefs.removeObserver(ARCHIVE_AFTER_PREF, prefObserver);
    clearTimeout(firstSweep);
    clearInterval(interval);
  };
}
