// SPDX-License-Identifier: MPL-2.0

// One remote <browser> per panel, created the first time the panel opens and
// kept while it is hidden, so chats, notes and music keep their state. They
// only go when the panel is removed (or on hot reload).

import { createSignal } from "solid-js";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import type { PanelBrowser, WebPanel } from "./types.ts";

export const FRAME_ID = "nw-web-panel-frame";

const browsers = new Map<string, PanelBrowser>();
const [titles, setTitles] = createSignal<Record<string, string>>({});

function setTitle(id: string, title: string): void {
  setTitles({ ...titles(), [id]: title });
}

export function panelTitle(panel: WebPanel): string {
  return titles()[panel.id] || panel.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function createBrowser(panel: WebPanel): PanelBrowser {
  const browser = document.createXULElement("browser") as unknown as PanelBrowser;
  browser.className = "nw-web-panel-browser";
  browser.setAttribute("type", "content");
  browser.setAttribute("remote", "true");
  browser.setAttribute("maychangeremoteness", "true");
  browser.setAttribute("nodefaultsrc", "true");
  browser.setAttribute("tooltip", "aHTMLTooltip");
  browser.setAttribute("contextmenu", "contentAreaContextMenu");
  browser.setAttribute("autocompletepopup", "PopupAutoComplete");
  browser.setAttribute("data-panel-id", panel.id);
  // As in the link preview: a <browser>'s color-scheme is its page's
  // prefers-color-scheme, and tab browsers follow the website appearance
  // setting.
  const pageStyle = getComputedStyle(tabbrowser().selectedBrowser as unknown as Element);
  browser.style.colorScheme = pageStyle?.colorScheme ?? "";
  browser.addEventListener("pagetitlechanged", () => setTitle(panel.id, browser.contentTitle));
  return browser;
}

function load(browser: PanelBrowser, url: string): void {
  browser.loadURI(Services.io.newURI(url), {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  });
}

export function panelBrowser(id: string): PanelBrowser | undefined {
  return browsers.get(id);
}

// Shows the panel's browser (creating it if needed) and hides the others.
export function showPanelBrowser(panel: WebPanel | undefined): void {
  const frame = document.getElementById(FRAME_ID);
  if (!frame) {
    return;
  }
  if (panel && !browsers.has(panel.id)) {
    const browser = createBrowser(panel);
    frame.appendChild(browser);
    browsers.set(panel.id, browser);
    load(browser, panel.url);
  }
  for (const [id, browser] of browsers) {
    browser.toggleAttribute("data-active", id === panel?.id);
  }
}

export function removePanelBrowser(id: string): void {
  browsers.get(id)?.remove();
  browsers.delete(id);
}

export function removeAllPanelBrowsers(): void {
  for (const browser of browsers.values()) {
    browser.remove();
  }
  browsers.clear();
}

// Back to the pinned page.
export function reloadPanel(panel: WebPanel): void {
  const browser = browsers.get(panel.id);
  if (browser) {
    load(browser, panel.url);
  }
}
