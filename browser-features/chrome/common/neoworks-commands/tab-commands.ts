// SPDX-License-Identifier: MPL-2.0

import { SIDEBAR_PEEK_EVENT } from "../neoworks-sidebar/sidebar-visibility.ts";
import { openNewTab, togglePinned } from "../neoworks-sidebar/tab-actions.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import type { NeoworksCommand } from "./registry.ts";

const browserWindow = window as unknown as {
  BrowserCommands: { back(): void; forward(): void; reload(): void };
  SessionWindowUI: { undoCloseTab(window: Window): void };
  gLazyFindCommand(command: string): void;
};

const NEXT = 1;
const PREVIOUS = -1;

// The sidebar briefly slides in so the new position in the tab list shows.
function peekSidebar(): void {
  dispatchEvent(new CustomEvent(SIDEBAR_PEEK_EVENT));
}

function advanceTab(direction: number): void {
  tabbrowser().tabContainer.advanceSelectedTab(direction, true);
  peekSidebar();
}

// Firefox's moves enter an open folder, step over a collapsed one and leave a
// folder past its first or last tab.
function moveCurrentTab(direction: number): void {
  if (direction === NEXT) {
    tabbrowser().moveTabForward();
  } else {
    tabbrowser().moveTabBackward();
  }
  peekSidebar();
}

function closeCurrentTab(): void {
  const browser = tabbrowser();
  browser.removeTab(browser.selectedTab, { animate: true });
}

function duplicateCurrentTab(): void {
  const browser = tabbrowser();
  browser.selectedTab = browser.duplicateTab(browser.selectedTab);
}

export const TAB_COMMANDS: NeoworksCommand[] = [
  { id: "tab:new", listed: true, run: openNewTab },
  { id: "tab:close", listed: true, run: closeCurrentTab },
  { id: "tab:next", listed: true, run: () => advanceTab(NEXT) },
  { id: "tab:previous", listed: true, run: () => advanceTab(PREVIOUS) },
  { id: "tab:move-up", listed: true, run: () => moveCurrentTab(PREVIOUS) },
  { id: "tab:move-down", listed: true, run: () => moveCurrentTab(NEXT) },
  { id: "tab:reload", listed: true, run: () => browserWindow.BrowserCommands.reload() },
  { id: "tab:duplicate", listed: true, run: duplicateCurrentTab },
  {
    id: "tab:toggle-pin",
    listed: true,
    run: () => togglePinned(tabbrowser().selectedTab),
  },
  {
    id: "tab:reopen-closed",
    listed: true,
    run: () => browserWindow.SessionWindowUI.undoCloseTab(window),
  },
  { id: "navigation:back", listed: true, run: () => browserWindow.BrowserCommands.back() },
  {
    id: "navigation:forward",
    listed: true,
    run: () => browserWindow.BrowserCommands.forward(),
  },
  {
    id: "find:open",
    listed: true,
    run: () => browserWindow.gLazyFindCommand("onFindCommand"),
  },
];
