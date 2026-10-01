// SPDX-License-Identifier: MPL-2.0

export interface LinkWindowTab {
  linkedBrowser: { currentURI: nsIURI };
}

export interface LinkWindowTabbrowser {
  selectedTab: LinkWindowTab;
  selectedBrowser: { currentURI: nsIURI; contentTitle: string };
  tabContainer: EventTarget;
  openTabs: unknown[];
  adoptTab(tab: LinkWindowTab, options: { tabIndex?: number; selectTab?: boolean }): unknown;
  addProgressListener(listener: object): void;
  removeProgressListener(listener: object): void;
}

export interface LinkWindowGlobal extends Window {
  gBrowser: LinkWindowTabbrowser;
}

export interface WindowTrackerModule {
  BrowserWindowTracker: {
    getTopWindow(options: { private?: boolean; allowPopups?: boolean }): LinkWindowGlobal | null;
    promiseOpenWindow(options: { args: unknown; private?: boolean }): Promise<LinkWindowGlobal>;
  };
}

export interface LinkWindowState {
  title: string;
  url: string;
}
