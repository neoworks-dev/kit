// SPDX-License-Identifier: MPL-2.0

export interface PageBrowser {
  currentURI: nsIURI;
  // Set by the AboutReader actor once Readability judged the page readable.
  isArticle?: boolean;
  securityUI: { state: number } | null;
}

// Browser window globals the page actions menu drives.
export interface PageActionsWindow {
  gBrowser: {
    selectedBrowser: PageBrowser;
    selectedTab: unknown;
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
  // The site (eTLD+1) for per-site settings; null outside http(s) pages.
  site: string | null;
  secure: boolean;
  zoomPercent: number;
  readerAvailable: boolean;
  readerActive: boolean;
  // The page can open in its own web app window.
  appAvailable: boolean;
}

export interface ToastMessage {
  text: string;
  // A Phosphor icon name from neoworks-ui/icons.css.
  icon: string;
}
