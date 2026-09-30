// SPDX-License-Identifier: MPL-2.0

// The hover preview card: page thumbnail, full title and URL, laid over the
// page to the right of the hovered row.

import { createEffect, onCleanup, onMount, Show } from "solid-js";
import { isNewTabPage } from "./new-tab-container.ts";
import { sidebarDocked } from "./sidebar-docking.ts";
import { sidebarVisible } from "./sidebar-visibility.ts";
import {
  dismissTabPreview,
  hideTabPreview,
  tabPreviewTarget,
} from "./tab-preview.ts";
import { attributeFlag } from "./tab-row.tsx";
import type {
  BrowserTab,
  PageThumbs,
  TabPreviewTarget,
  TabState,
} from "./types.ts";

const THUMBNAIL_WIDTH = 280;
const THUMBNAIL_HEIGHT = 140;
// Space between the card and the window edge.
const GAP = 8;
// From the sidebar's edge, so a docked sidebar's card clears the page's edge.
const SIDEBAR_OFFSET = 16;
const HTML_NS = "http://www.w3.org/1999/xhtml";

const browserWindow = window as unknown as { PageThumbs: PageThumbs };

// Pointer actions that dismiss the card until the pointer leaves the row.
const DISMISS_EVENTS = ["mousedown", "dragstart", "contextmenu", "wheel"];

function hasThumbnail(tab: BrowserTab): boolean {
  return !tab.hasAttribute("pending") && !!tab.linkedBrowser.browsingContext;
}

function urlOf(tab: BrowserTab): string {
  return tab.linkedBrowser.currentURI?.spec ?? "";
}

// The host is shown strong, the rest of the URL dimmed.
function splitUrl(spec: string): { host: string; rest: string } {
  try {
    const url = new URL(spec);
    if (url.host) {
      return {
        host: url.host.replace(/^www\./, ""),
        rest: url.pathname + url.search,
      };
    }
  } catch {
    // Not a parseable URL; show it as is.
  }
  return { host: "", rest: spec };
}

function createThumbnail(tab: BrowserTab, container: Element): void {
  container.replaceChildren();
  if (!hasThumbnail(tab)) {
    return;
  }
  const canvas = document.createElementNS(
    HTML_NS,
    "canvas",
  ) as HTMLCanvasElement;
  canvas.width = THUMBNAIL_WIDTH * devicePixelRatio;
  canvas.height = THUMBNAIL_HEIGHT * devicePixelRatio;
  browserWindow.PageThumbs.captureTabPreviewThumbnail(tab.linkedBrowser, canvas)
    .then((captured) => {
      if (captured && tabPreviewTarget()?.tab === tab) {
        container.replaceChildren(canvas);
      }
    })
    .catch((error: unknown) => {
      // Usually the tab closed while it was being captured.
      console.error("[neoworks-sidebar] Tab preview capture failed:", error);
    });
}

// Beside the sidebar, level with the row, kept inside the layer.
function placeCard(card: HTMLElement, target: TabPreviewTarget): void {
  const layer = card.offsetParent;
  const sidebar = target.anchor.closest("#neoworks-sidebar");
  if (!layer || !sidebar) {
    return;
  }
  const layerRect = layer.getBoundingClientRect();
  const rowTop = target.anchor.getBoundingClientRect().top - layerRect.top;
  const maxTop = layerRect.height - card.offsetHeight - GAP;
  card.style.left = `${
    sidebar.getBoundingClientRect().right - layerRect.left + SIDEBAR_OFFSET
  }px`;
  card.style.top = `${Math.max(GAP, Math.min(rowTop, maxTop))}px`;
}

export function TabPreview(props: { tabState: TabState }) {
  const tab = () => tabPreviewTarget()?.tab ?? null;

  // Re-read on tab events, so title and URL follow the page.
  const read = <T,>(getter: (tab: BrowserTab) => T, fallback: T) => () => {
    props.tabState.revision();
    const current = tab();
    return current ? getter(current) : fallback;
  };
  const title = read((current) => current.label || "New Tab", "");
  const url = read((current) => splitUrl(urlOf(current)), {
    host: "",
    rest: "",
  });
  const showsUrl = read((current) => !isNewTabPage(urlOf(current)), false);
  const showsThumbnail = read(hasThumbnail, false);

  const thumbnail = (
    <div
      class="nw-tab-preview-thumbnail"
      data-hidden={attributeFlag(!showsThumbnail())}
    />
  ) as HTMLDivElement;
  const card = (
    <div id="neoworks-tab-preview" data-visible={attributeFlag(!!tab())}>
      {thumbnail}
      <div class="nw-tab-preview-text">
        <span class="nw-tab-preview-title">{title()}</span>
        <Show when={showsUrl()}>
          <span class="nw-tab-preview-url">
            <span class="nw-tab-preview-host">{url().host}</span>
            {url().rest}
          </span>
        </Show>
      </div>
    </div>
  ) as HTMLDivElement;

  // Runs after the card's contents update, so its height is current.
  createEffect(() => {
    const target = tabPreviewTarget();
    if (target) {
      createThumbnail(target.tab, thumbnail);
      placeCard(card, target);
    }
  });

  createEffect(() => {
    if (!sidebarDocked() && !sidebarVisible()) {
      hideTabPreview();
    }
  });

  // A closed tab's row goes away without a mouseleave.
  createEffect(() => {
    props.tabState.revision();
    const current = tabPreviewTarget()?.tab;
    if (current && (current.closing || !current.isConnected)) {
      hideTabPreview();
    }
  });

  onMount(() => {
    for (const eventName of DISMISS_EVENTS) {
      addEventListener(eventName, dismissTabPreview, true);
    }
  });
  onCleanup(() => {
    for (const eventName of DISMISS_EVENTS) {
      removeEventListener(eventName, dismissTabPreview, true);
    }
    hideTabPreview();
  });

  return card;
}
