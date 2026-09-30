// SPDX-License-Identifier: MPL-2.0

// Kit's split view on top of Firefox's. Firefox groups a split's tabs in a
// <tab-split-view-wrapper> and keeps all of their pages active and painted,
// but only lays out two side by side. Kit keeps its own layout tree per
// wrapper (any number of panes, side by side or stacked, nested) and places
// the panes itself.

import { createSignal } from "solid-js";
import { defaultContainerId } from "../neoworks-sidebar/containers.ts";
import {
  insertAtDivider,
  insertPane,
  layoutSplit,
  pane,
  removePane,
  resizeDivider,
  syncPanes,
} from "./layout.ts";
import type {
  DividerRect,
  DropSide,
  Rect,
  SplitDirection,
  SplitLayout,
  SplitNode,
  SplitTab,
  SplitTabbrowser,
  SplitViewWrapper,
} from "./types.ts";

// Matches the page's inset from the window frame.
export const PANE_GAP_PX = 8;
const MIN_PANE_PX = 160;
const SPLIT_ATTRIBUTE = "nw-split";

const PANE_PROPERTIES = ["--nw-pane-x", "--nw-pane-y", "--nw-pane-width", "--nw-pane-height"];

const browserWindow = window as unknown as {
  gBrowser: SplitTabbrowser;
  BROWSER_NEW_TAB_URL: string;
};

function tabbrowser(): SplitTabbrowser {
  return browserWindow.gBrowser;
}

const layouts = new WeakMap<SplitViewWrapper, SplitNode<SplitTab>>();
const styledPanels = new Set<HTMLElement>();

// The content area and the active split's panes and dividers, in window
// coordinates, for the overlay.
const [contentBounds, setContentBounds] = createSignal<Rect | null>(null);
const [activeLayout, setActiveLayout] = createSignal<SplitLayout<SplitTab> | null>(null);

export { activeLayout, contentBounds };

function panelOf(tab: SplitTab): HTMLElement | null {
  return document.getElementById(tab.linkedPanel);
}

function clearPanel(panel: HTMLElement): void {
  for (const property of PANE_PROPERTIES) {
    panel.style.removeProperty(property);
  }
}

function clearLayout(): void {
  for (const panel of styledPanels) {
    clearPanel(panel);
  }
  styledPanels.clear();
  tabbrowser().tabpanels.removeAttribute(SPLIT_ATTRIBUTE);
  document.documentElement.removeAttribute(SPLIT_ATTRIBUTE);
  setActiveLayout(null);
}

function toWindow(layout: SplitLayout<SplitTab>, origin: Rect): SplitLayout<SplitTab> {
  const shift = (rect: Rect): Rect => ({ ...rect, x: rect.x + origin.x, y: rect.y + origin.y });
  return {
    panes: layout.panes.map((entry) => ({ ...entry, rect: shift(entry.rect) })),
    dividers: layout.dividers.map((divider) => ({ ...divider, rect: shift(divider.rect) })),
  };
}

function currentRoot(wrapper: SplitViewWrapper): SplitNode<SplitTab> | null {
  const root = syncPanes(layouts.get(wrapper) ?? null, wrapper.tabs);
  if (root) {
    layouts.set(wrapper, root);
  }
  return root;
}

function applyLayout(): void {
  const panels = tabbrowser().tabpanels;
  const bounds = panels.getBoundingClientRect();
  setContentBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });

  const wrapper = tabbrowser().activeSplitView;
  const root = wrapper ? currentRoot(wrapper) : null;
  if (!root || root.kind === "pane") {
    clearLayout();
    return;
  }
  const local = layoutSplit(
    root,
    { x: 0, y: 0, width: bounds.width, height: bounds.height },
    PANE_GAP_PX,
  );
  const placed = new Set<HTMLElement>();
  for (const { item, rect } of local.panes) {
    const panel = panelOf(item);
    if (!panel) {
      continue;
    }
    panel.style.setProperty("--nw-pane-x", `${rect.x}px`);
    panel.style.setProperty("--nw-pane-y", `${rect.y}px`);
    panel.style.setProperty("--nw-pane-width", `${rect.width}px`);
    panel.style.setProperty("--nw-pane-height", `${rect.height}px`);
    placed.add(panel);
    styledPanels.add(panel);
  }
  for (const panel of styledPanels) {
    if (!placed.has(panel)) {
      clearPanel(panel);
      styledPanels.delete(panel);
    }
  }
  panels.setAttribute(SPLIT_ATTRIBUTE, "true");
  document.documentElement.setAttribute(SPLIT_ATTRIBUTE, "true");
  setActiveLayout(toWindow(local, bounds));
}

// Firefox fires several events per change (and updates the wrapper's tabs
// from a mutation observer); lay out once they've settled.
let layoutQueued = false;

export function queueLayout(): void {
  if (layoutQueued) {
    return;
  }
  layoutQueued = true;
  queueMicrotask(() => {
    layoutQueued = false;
    try {
      applyLayout();
    } catch (error) {
      console.error("[neoworks-split] Layout failed:", error);
    }
  });
}

// Firefox leaves pinned tabs out of split views.
function canSplit(tab: SplitTab): boolean {
  return !tab.pinned && !tab.closing;
}

function openTab(): SplitTab {
  return tabbrowser().addTrustedTab(browserWindow.BROWSER_NEW_TAB_URL, {
    userContextId: defaultContainerId(),
  });
}

// Puts `tab` beside `target` (a pane on screen) on `side`. Starts a split
// view, joins the target's, or moves a pane within the same split.
export function splitWith(target: SplitTab, tab: SplitTab, side: DropSide): void {
  if (target === tab || !canSplit(target) || !canSplit(tab)) {
    return;
  }
  const browser = tabbrowser();
  const wrapper = target.splitview;
  if (tab.splitview && tab.splitview !== wrapper) {
    // Taking a tab out of another split view isn't supported by Firefox.
    return;
  }
  if (wrapper) {
    let root = currentRoot(wrapper) ?? pane(target);
    if (tab.splitview === wrapper) {
      root = removePane(root, tab) ?? pane(target);
    }
    layouts.set(wrapper, insertPane(root, target, tab, side));
    if (tab.splitview !== wrapper) {
      wrapper.addTabs([tab]);
    }
  } else {
    const created = browser.addTabSplitView([target, tab], { insertBefore: target });
    if (!created) {
      return;
    }
    layouts.set(created, insertPane(pane(target), target, tab, side));
  }
  browser.selectedTab = tab;
  queueLayout();
}

// Space w v / Space w s: a new tab beside the current page.
export function splitSelected(direction: SplitDirection): void {
  const target = tabbrowser().selectedTab;
  if (!canSplit(target)) {
    return;
  }
  const side: DropSide = direction === "row" ? "right" : "bottom";
  splitWith(target, openTab(), side);
}

// The divider's plus button: a new tab between its two neighbors.
export function addPaneAt(divider: DividerRect): void {
  const wrapper = tabbrowser().activeSplitView;
  const root = wrapper && currentRoot(wrapper);
  if (!wrapper || !root) {
    return;
  }
  const tab = openTab();
  layouts.set(wrapper, insertAtDivider(root, divider.path, divider.index, tab));
  wrapper.addTabs([tab]);
  tabbrowser().selectedTab = tab;
  queueLayout();
}

// Resizing works from the layout the drag started with, so rounding doesn't
// build up while the pointer moves.
export function startResize(divider: DividerRect): (movedPx: number) => void {
  const wrapper = tabbrowser().activeSplitView;
  const startRoot = wrapper && currentRoot(wrapper);
  return (movedPx: number) => {
    if (!wrapper || !startRoot) {
      return;
    }
    const length = divider.splitLength;
    layouts.set(
      wrapper,
      resizeDivider(startRoot, divider.path, divider.index, movedPx / length, MIN_PANE_PX / length),
    );
    applyLayout();
  };
}

// Firefox's wrapper can't drop a single tab: its own list of tabs keeps the
// old one. Rebuild the split from the tabs that stay instead, keeping the
// layout.
function rebuildWithout(wrapper: SplitViewWrapper, leaving: SplitTab | null): void {
  const browser = tabbrowser();
  const staying = wrapper.tabs.filter((tab) => tab !== leaving && !tab.closing);
  let root = currentRoot(wrapper);
  if (root && leaving) {
    root = removePane(root, leaving);
  }
  const selected = browser.selectedTab;
  wrapper.unsplitTabs();
  if (staying.length < 2) {
    return;
  }
  const rebuilt = browser.addTabSplitView(staying, { insertBefore: staying[0] });
  if (!rebuilt) {
    return;
  }
  layouts.set(rebuilt, syncPanes(root, staying) ?? pane(staying[0]));
  // Stay on the split rather than the tab that left it.
  browser.selectedTab = staying.includes(selected) ? selected : staying[0];
  queueLayout();
}

export function removeFromSplit(tab: SplitTab): void {
  if (tab.splitview) {
    rebuildWithout(tab.splitview, tab);
  }
}

// Closing one pane of three or more leaves Firefox's wrapper with a stale
// tab list too.
function handleTabClose(event: Event): void {
  const tab = event.target as unknown as SplitTab;
  const wrapper = tab.splitview;
  if (!wrapper || wrapper.tabs.length <= 2) {
    return;
  }
  setTimeout(() => {
    if (wrapper.isConnected) {
      rebuildWithout(wrapper, null);
    }
  }, 0);
}

// Space w q: closes the pane you're in, like closing a vim window.
export function closeSelectedPane(): void {
  const tab = tabbrowser().selectedTab;
  if (tab.splitview) {
    tabbrowser().removeTab(tab);
  }
}

const LAYOUT_EVENTS = [
  "TabSplitViewActivate",
  "TabSplitViewDeactivate",
  "SplitViewTabChange",
  "SplitViewRemoved",
  "TabSelect",
  "TabClose",
];

// Returns a stop function for hot reload.
export function watchSplitViews(): () => void {
  const tabContainer = tabbrowser().tabContainer;
  for (const eventName of LAYOUT_EVENTS) {
    tabContainer.addEventListener(eventName, queueLayout);
  }
  tabContainer.addEventListener("TabClose", handleTabClose);
  const resizeObserver = new ResizeObserver(queueLayout);
  resizeObserver.observe(tabbrowser().tabpanels);
  addEventListener("resize", queueLayout);
  queueLayout();
  return () => {
    for (const eventName of LAYOUT_EVENTS) {
      tabContainer.removeEventListener(eventName, queueLayout);
    }
    tabContainer.removeEventListener("TabClose", handleTabClose);
    resizeObserver.disconnect();
    removeEventListener("resize", queueLayout);
    clearLayout();
  };
}
