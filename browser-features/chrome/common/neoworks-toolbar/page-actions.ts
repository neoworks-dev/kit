// SPDX-License-Identifier: MPL-2.0

import type { PageActionsWindow, PageBrowser, PageState } from "./types.ts";

const { TaskbarTabs } = ChromeUtils.importESModule(
  "resource:///modules/taskbartabs/TaskbarTabs.sys.mjs",
) as {
  TaskbarTabs: { moveTabIntoTaskbarTab(tab: unknown): Promise<void> };
};

const READER_URL_PREFIX = "about:reader";
const SCREENSHOT_REASON = "toolbar_button";
const PERMISSIONS_TAB = "permTab";

export function chromeWindow(): PageActionsWindow {
  return window as unknown as PageActionsWindow;
}

function selectedBrowser(): PageBrowser {
  return chromeWindow().gBrowser.selectedBrowser;
}

// nsIURI.host throws for URIs without one (about:, data:).
function hostOf(browser: PageBrowser): string {
  try {
    return browser.currentURI.host;
  } catch {
    return "";
  }
}

function isSecure(browser: PageBrowser): boolean {
  const secureFlag = Ci.nsIWebProgressListener.STATE_IS_SECURE;
  if (!browser.securityUI || secureFlag === undefined) {
    return false;
  }
  return (browser.securityUI.state & secureFlag) !== 0;
}

// Firefox shows its web app page action only where a page can become one
// (http(s) pages with the feature enabled); Kit hides the icon but follows
// the same rule.
function canOpenAsApp(): boolean {
  const button = document.getElementById("taskbar-tabs-button");
  return !!button && !button.hidden;
}

function zoomPercent(browser: PageBrowser): number {
  return Math.round(chromeWindow().ZoomManager.getZoomForBrowser(browser) * 100);
}

export function readPageState(): PageState {
  const browser = selectedBrowser();
  const url = browser.currentURI.spec;
  const readerActive = url.startsWith(READER_URL_PREFIX);
  return {
    url,
    host: hostOf(browser),
    secure: isSecure(browser),
    zoomPercent: zoomPercent(browser),
    readerAvailable: readerActive || browser.isArticle === true,
    readerActive,
    appAvailable: canOpenAsApp(),
  };
}

export function takeScreenshot(): void {
  chromeWindow().ScreenshotsUtils.start(selectedBrowser(), SCREENSHOT_REASON);
}

export function bookmarkPage(): Promise<void> {
  return chromeWindow().PlacesCommandHook.bookmarkPage();
}

// The reader actor resolves the window from the event target's document.
export function toggleReaderMode(event: Event): void {
  chromeWindow().AboutReaderParent.toggleReaderMode(event);
}

export function openAsApp(): Promise<void> {
  return TaskbarTabs.moveTabIntoTaskbarTab(chromeWindow().gBrowser.selectedTab);
}

export function copyPageUrl(): void {
  const clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
    Ci.nsIClipboardHelper,
  );
  clipboard.copyString(selectedBrowser().currentURI.spec);
}

export async function zoomIn(): Promise<void> {
  await chromeWindow().FullZoom.enlarge();
}

export async function zoomOut(): Promise<void> {
  await chromeWindow().FullZoom.reduce();
}

export async function resetZoom(): Promise<void> {
  await chromeWindow().FullZoom.reset();
}

export function openSitePermissions(): void {
  chromeWindow().BrowserCommands.pageInfo(null, PERMISSIONS_TAB);
}

// Same flow as the identity panel's "Clear cookies and site data" button,
// minus its wait for that panel to close.
export async function clearSiteData(host: string): Promise<void> {
  const siteDataManager = chromeWindow().SiteDataManager;
  const baseDomain = siteDataManager.getBaseDomainFromHost(host);
  if (!siteDataManager.promptSiteDataRemoval(window, [baseDomain])) {
    return;
  }
  await siteDataManager.remove(baseDomain);
}
