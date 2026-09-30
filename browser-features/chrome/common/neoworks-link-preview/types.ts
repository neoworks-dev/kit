// SPDX-License-Identifier: MPL-2.0

// The remote <browser> the preview card loads the link in.
export interface PreviewBrowser extends XULElement {
  style: CSSStyleDeclaration;
  contentTitle: string;
  browsingContext: {
    currentWindowGlobal: { documentURI: { spec: string } | null } | null;
  } | null;
  loadURI(uri: nsIURI, params: { triggeringPrincipal: nsIPrincipal }): void;
  addProgressListener(listener: nsIWebProgressListener, mask: number): void;
  removeProgressListener(listener: nsIWebProgressListener): void;
  focus(): void;
}

export interface PreviewTab {
  userContextId: number;
  pinned: boolean;
}

export interface PreviewTabbrowser {
  tabs: PreviewTab[];
  selectedTab: PreviewTab;
  selectedBrowser: PreviewBrowser;
  tabContainer: EventTarget;
  getTabForBrowser(browser: Element): PreviewTab | null;
  addTrustedTab(url: string, options: { userContextId: number; index?: number }): PreviewTab;
}

export interface PreviewState {
  url: string;
  title: string;
  loading: boolean;
}

export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}
