// SPDX-License-Identifier: MPL-2.0

// Windows opened without a toolbar (links from other apps, see
// external-links.ts, and pages' own pop-ups) are minimal: no sidebar or top
// bar, just a header with the page and a way into the main window.

import { createSignal } from "solid-js";
import type { LinkWindowGlobal, LinkWindowState, WindowTrackerModule } from "./types.ts";

const MINIMAL_ATTRIBUTE = "nw-minimal-window";

const { BrowserWindowTracker } = ChromeUtils.importESModule(
  "resource:///modules/BrowserWindowTracker.sys.mjs",
) as WindowTrackerModule;

const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
) as { PrivateBrowsingUtils: { isWindowPrivate(window: Window): boolean } };

const [page, setPage] = createSignal<LinkWindowState>({ title: "", url: "" });

export { page };

function chromeWindow(): LinkWindowGlobal {
  return window as unknown as LinkWindowGlobal;
}

export function isMinimalWindow(): boolean {
  return !window.toolbar.visible;
}

function readPage(): void {
  const browser = chromeWindow().gBrowser.selectedBrowser;
  const url = browser.currentURI.spec;
  setPage({ title: browser.contentTitle || url, url });
}

// Moves the page into the most recent normal window as its selected tab, or
// a new window if there is none; this window then closes with its last tab.
export async function openInMainWindow(): Promise<void> {
  const tab = chromeWindow().gBrowser.selectedTab;
  const isPrivate = PrivateBrowsingUtils.isWindowPrivate(window);
  const main = BrowserWindowTracker.getTopWindow({ private: isPrivate });
  if (!main) {
    await BrowserWindowTracker.promiseOpenWindow({ args: tab, private: isPrivate });
    return;
  }
  main.gBrowser.adoptTab(tab, { tabIndex: main.gBrowser.openTabs.length, selectTab: true });
  main.focus();
}

export function runOpenInMainWindow(): void {
  openInMainWindow().catch((error: unknown) => {
    console.error("[neoworks-link-window] Moving the page to the main window failed:", error);
  });
}

// Ctrl+Enter (Cmd+Enter on macOS), as in the link preview. Captured before
// the page sees it.
function handleKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.altKey) {
    return;
  }
  if (!(event.ctrlKey || event.metaKey)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) {
    runOpenInMainWindow();
  }
}

// Returns a stop function for hot reload.
export function setUpMinimalWindow(): () => void {
  const gBrowser = chromeWindow().gBrowser;
  document.documentElement.setAttribute(MINIMAL_ATTRIBUTE, "true");
  const progressListener = {
    onLocationChange: readPage,
  };
  gBrowser.addProgressListener(progressListener);
  gBrowser.tabContainer.addEventListener("TabAttrModified", readPage);
  addEventListener("keydown", handleKeyDown, true);
  readPage();
  return () => {
    removeEventListener("keydown", handleKeyDown, true);
    gBrowser.tabContainer.removeEventListener("TabAttrModified", readPage);
    gBrowser.removeProgressListener(progressListener);
    document.documentElement.removeAttribute(MINIMAL_ATTRIBUTE);
  };
}
