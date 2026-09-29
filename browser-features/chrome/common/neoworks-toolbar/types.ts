// SPDX-License-Identifier: MPL-2.0

export interface PageBrowser {
  currentURI: { spec: string; host: string };
  // Set by the AboutReader actor once Readability judged the page readable.
  isArticle?: boolean;
  securityUI: { state: number } | null;
}

// Browser window globals the page actions menu drives.
export interface PageActionsWindow {
  gBrowser: {
    selectedBrowser: PageBrowser;
    tabContainer: EventTarget;
  };
  FullZoom: {
    enlarge(): Promise<void> | void;
    reduce(): Promise<void> | void;
    reset(): Promise<void> | void;
  };
  ZoomManager: { getZoomForBrowser(browser: PageBrowser): number };
  PlacesCommandHook: { bookmarkPage(): Promise<void> };
  AboutReaderParent: { toggleReaderMode(event: Event): void };
  ScreenshotsUtils: { start(browser: PageBrowser, reason: string): void };
  BrowserCommands: { pageInfo(documentURL: string | null, initialTab: string): void };
  SiteDataManager: {
    getBaseDomainFromHost(host: string): string;
    promptSiteDataRemoval(win: Window, baseDomains: string[]): boolean;
    remove(baseDomain: string): Promise<void>;
  };
}

export interface PageState {
  url: string;
  // Empty for pages without a host (about:, file:), which have no site data.
  host: string;
  secure: boolean;
  zoomPercent: number;
  readerAvailable: boolean;
  readerActive: boolean;
}
