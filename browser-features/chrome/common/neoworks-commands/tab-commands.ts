// SPDX-License-Identifier: MPL-2.0

import { SIDEBAR_PEEK_EVENT } from "../neoworks-sidebar/sidebar-visibility.ts";
import { togglePinned } from "../neoworks-sidebar/tab-actions.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import type { NeoworksCommand } from "./registry.ts";

const browserWindow = window as unknown as {
  BROWSER_NEW_TAB_URL: string;
  BrowserCommands: { back(): void; forward(): void; reload(): void };
  SessionWindowUI: { undoCloseTab(window: Window): void };
  gLazyFindCommand(command: string): void;
};

const NEXT = 1;
const PREVIOUS = -1;

// New tabs inherit the current tab's container and take keyboard focus, since
// the (hidden) URL bar would otherwise swallow typing.
function openNewTab(): void {
  const browser = tabbrowser();
  const tab = browser.addTrustedTab(browserWindow.BROWSER_NEW_TAB_URL, {
    userContextId: browser.selectedTab.userContextId,
  });
  browser.selectedTab = tab;
  browser.selectedBrowser.focus();
}

// The sidebar briefly slides in so the new position in the tab list shows.
function advanceTab(direction: number): void {
  tabbrowser().tabContainer.advanceSelectedTab(direction, true);
  dispatchEvent(new CustomEvent(SIDEBAR_PEEK_EVENT));
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
  { id: "tab:new", title: "New Tab", listed: true, run: openNewTab },
  { id: "tab:close", title: "Close Tab", listed: true, run: closeCurrentTab },
  {
    id: "tab:next",
    title: "Next Tab",
    listed: true,
    run: () => advanceTab(NEXT),
  },
  {
    id: "tab:previous",
    title: "Previous Tab",
    listed: true,
    run: () => advanceTab(PREVIOUS),
  },
  {
    id: "tab:reload",
    title: "Reload Tab",
    listed: true,
    run: () => browserWindow.BrowserCommands.reload(),
  },
  { id: "tab:duplicate", title: "Duplicate Tab", listed: true, run: duplicateCurrentTab },
  {
    id: "tab:toggle-pin",
    title: "Pin / Unpin Tab",
    listed: true,
    run: () => togglePinned(tabbrowser().selectedTab),
  },
  {
    id: "tab:reopen-closed",
    title: "Reopen Closed Tab",
    listed: true,
    run: () => browserWindow.SessionWindowUI.undoCloseTab(window),
  },
  {
    id: "navigation:back",
    title: "Back",
    listed: true,
    run: () => browserWindow.BrowserCommands.back(),
  },
  {
    id: "navigation:forward",
    title: "Forward",
    listed: true,
    run: () => browserWindow.BrowserCommands.forward(),
  },
  {
    id: "find:open",
    title: "Find in Page",
    listed: true,
    run: () => browserWindow.gLazyFindCommand("onFindCommand"),
  },
];
