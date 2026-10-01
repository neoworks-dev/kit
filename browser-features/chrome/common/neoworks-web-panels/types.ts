// SPDX-License-Identifier: MPL-2.0

export interface WebPanel {
  id: string;
  url: string;
  // Width of the pane in CSS pixels.
  width: number;
}

// The remote <browser> a panel's page lives in.
export interface PanelBrowser extends XULElement {
  style: CSSStyleDeclaration;
  contentTitle: string;
  currentURI: nsIURI;
  canGoBack: boolean;
  loadURI(uri: nsIURI, params: { triggeringPrincipal: nsIPrincipal }): void;
  goBack(): void;
  reload(): void;
  focus(): void;
}
