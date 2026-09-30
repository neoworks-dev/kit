// SPDX-License-Identifier: MPL-2.0

// Alt+click on a link (NWLinkPreview actor) opens it in a card over the page.
// The card holds its own remote <browser>, created on open and destroyed on
// close; "Open as tab" reloads the page as a real tab next to the current one.

import { createSignal } from "solid-js";
import {
  NW_LINK_PREVIEW_EVENT,
  type NWLinkPreviewRequest,
} from "#features-modules/common/NWLinkPreview.ts";
import type {
  Bounds,
  PreviewBrowser,
  PreviewState,
  PreviewTabbrowser,
} from "./types.ts";

export const FRAME_ID = "nw-link-preview-frame";
const BROWSER_ID = "nw-link-preview-browser";

// The generated XPCOM types mark interface constants as optional.
const STATE_START = Ci.nsIWebProgressListener.STATE_START ?? 0;
const STATE_STOP = Ci.nsIWebProgressListener.STATE_STOP ?? 0;
const STATE_IS_NETWORK = Ci.nsIWebProgressListener.STATE_IS_NETWORK ?? 0;
const PROGRESS_MASK = (Ci.nsIWebProgress.NOTIFY_STATE_WINDOW ?? 0) |
  (Ci.nsIWebProgress.NOTIFY_LOCATION ?? 0);

const [preview, setPreview] = createSignal<PreviewState | null>(null);
const [bounds, setBounds] = createSignal<Bounds | null>(null);

export { bounds, preview };

let previewBrowser: PreviewBrowser | null = null;
let previewContextId = 0;
let stopTracking: (() => void) | null = null;

function tabbrowser(): PreviewTabbrowser {
  return gBrowser as unknown as PreviewTabbrowser;
}

function updatePreview(changes: Partial<PreviewState>): void {
  const current = preview();
  if (current) {
    setPreview({ ...current, ...changes });
  }
}

function measureBounds(): void {
  const panels = document.getElementById("tabbrowser-tabpanels");
  if (!panels) {
    return;
  }
  const rect = panels.getBoundingClientRect();
  setBounds({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
}

function currentUrl(browser: PreviewBrowser): string | undefined {
  return browser.browsingContext?.currentWindowGlobal?.documentURI?.spec;
}

function createBrowser(userContextId: number): PreviewBrowser {
  const browser = document.createXULElement("browser") as unknown as PreviewBrowser;
  browser.id = BROWSER_ID;
  browser.setAttribute("type", "content");
  browser.setAttribute("remote", "true");
  browser.setAttribute("maychangeremoteness", "true");
  browser.setAttribute("nodefaultsrc", "true");
  browser.setAttribute("usercontextid", String(userContextId));
  browser.setAttribute("tooltip", "aHTMLTooltip");
  browser.setAttribute("contextmenu", "contentAreaContextMenu");
  browser.setAttribute("autocompletepopup", "PopupAutoComplete");
  // A <browser>'s color-scheme sets its page's prefers-color-scheme. Kit's
  // chrome is dark; tab browsers follow Firefox's website appearance setting.
  browser.style.colorScheme = getComputedStyle(tabbrowser().selectedBrowser).colorScheme;
  return browser;
}

// Keeps the header's title, URL and loading state in step with the page.
function trackPage(browser: PreviewBrowser): () => void {
  const listener = {
    QueryInterface: ChromeUtils.generateQI([
      "nsIWebProgressListener",
      "nsISupportsWeakReference",
    ]),
    onStateChange(webProgress: nsIWebProgress, _request: nsIRequest, flags: number) {
      if (!webProgress.isTopLevel || !(flags & STATE_IS_NETWORK)) {
        return;
      }
      if (flags & STATE_START) {
        updatePreview({ loading: true });
      }
      if (flags & STATE_STOP) {
        updatePreview({ loading: false, title: browser.contentTitle || preview()?.title });
      }
    },
    onLocationChange(webProgress: nsIWebProgress, _request: nsIRequest, location: nsIURI) {
      if (webProgress.isTopLevel) {
        updatePreview({ url: location.spec });
      }
    },
    onProgressChange() {},
    onStatusChange() {},
    onSecurityChange() {},
    onContentBlockingEvent() {},
  } as unknown as nsIWebProgressListener;

  const onTitleChanged = () => {
    updatePreview({ title: browser.contentTitle, url: currentUrl(browser) ?? preview()?.url });
  };

  try {
    browser.addProgressListener(listener, PROGRESS_MASK);
  } catch (error) {
    console.error("[neoworks-link-preview] Can't follow the preview's progress:", error);
  }
  browser.addEventListener("pagetitlechanged", onTitleChanged);
  return () => {
    browser.removeEventListener("pagetitlechanged", onTitleChanged);
    try {
      browser.removeProgressListener(listener);
    } catch {
      // The browsing context is already gone.
    }
  };
}

function load(browser: PreviewBrowser, url: string, principal: nsIPrincipal): void {
  browser.loadURI(Services.io.newURI(url), { triggeringPrincipal: principal });
}

function showPreview(request: NWLinkPreviewRequest, userContextId: number): void {
  closePreview();
  measureBounds();
  setPreview({ url: request.url, title: request.url, loading: true });
  const frame = document.getElementById(FRAME_ID);
  if (!frame) {
    console.error("[neoworks-link-preview] Preview card is not mounted.");
    setPreview(null);
    return;
  }
  const browser = createBrowser(userContextId);
  frame.appendChild(browser);
  previewBrowser = browser;
  previewContextId = userContextId;
  stopTracking = trackPage(browser);
  load(browser, request.url, request.triggeringPrincipal);
  browser.focus();
}

function handleRequest(event: Event): void {
  const request = (event as CustomEvent<NWLinkPreviewRequest>).detail;
  try {
    // Alt+click inside the preview follows the link in place.
    if (previewBrowser && request.browser === previewBrowser) {
      load(previewBrowser, request.url, request.triggeringPrincipal);
      return;
    }
    const tab = tabbrowser().getTabForBrowser(request.browser);
    if (!tab) {
      return;
    }
    showPreview(request, tab.userContextId);
  } catch (error) {
    console.error("[neoworks-link-preview] Opening the preview failed:", error);
  }
}

export function closePreview(): void {
  stopTracking?.();
  stopTracking = null;
  const hadPreview = previewBrowser !== null;
  previewBrowser?.remove();
  previewBrowser = null;
  setPreview(null);
  if (hadPreview) {
    tabbrowser().selectedBrowser.focus();
  }
}

export function openPreviewAsTab(): void {
  const url = preview()?.url;
  if (!url) {
    return;
  }
  const browser = tabbrowser();
  const tab = browser.addTrustedTab(url, {
    userContextId: previewContextId,
    index: browser.tabs.indexOf(browser.selectedTab) + 1,
  });
  closePreview();
  browser.selectedTab = tab;
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!preview()) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closePreview();
    return;
  }
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    event.stopPropagation();
    openPreviewAsTab();
  }
}

function measureWhileOpen(): void {
  if (preview()) {
    measureBounds();
  }
}

export function watchLinkPreviews(): () => void {
  const tabContainer = tabbrowser().tabContainer;
  const panels = document.getElementById("tabbrowser-tabpanels");
  const resizeObserver = new ResizeObserver(measureWhileOpen);
  if (panels) {
    resizeObserver.observe(panels);
  }
  addEventListener(NW_LINK_PREVIEW_EVENT, handleRequest);
  addEventListener("keydown", handleKeyDown, true);
  addEventListener("resize", measureWhileOpen);
  tabContainer.addEventListener("TabSelect", closePreview);
  return () => {
    tabContainer.removeEventListener("TabSelect", closePreview);
    removeEventListener("resize", measureWhileOpen);
    removeEventListener("keydown", handleKeyDown, true);
    removeEventListener(NW_LINK_PREVIEW_EVENT, handleRequest);
    resizeObserver.disconnect();
    closePreview();
  };
}
