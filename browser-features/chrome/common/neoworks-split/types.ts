// SPDX-License-Identifier: MPL-2.0

import type { BrowserTab } from "../neoworks-sidebar/types.ts";

// "row": side by side (a vertical split, vim's :vsplit); "column": stacked.
export type SplitDirection = "row" | "column";

export type DropSide = "left" | "right" | "top" | "bottom";

// Panes nest: a split holds panes or further splits, each with its share of
// the split's length (sizes sum to 1).
export type SplitNode<T> =
  | { kind: "pane"; item: T }
  | { kind: "split"; direction: SplitDirection; children: SplitNode<T>[]; sizes: number[] };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PaneRect<T> {
  item: T;
  rect: Rect;
}

// The gap between children `index` and `index + 1` of the split at `path`
// (child indices from the root).
export interface DividerRect {
  path: number[];
  index: number;
  direction: SplitDirection;
  rect: Rect;
  // The split's length along its direction minus the gaps: what sizes are
  // fractions of.
  splitLength: number;
}

export interface SplitLayout<T> {
  panes: PaneRect<T>[];
  dividers: DividerRect[];
}

// Firefox's <tab-split-view-wrapper>: the tabs of one split view, kept
// together in the tab strip.
export interface SplitViewWrapper extends XULElement {
  readonly tabs: SplitTab[];
  readonly splitViewId: number;
  addTabs(tabs: SplitTab[]): void;
  unsplitTabs(trigger?: string): void;
}

export interface SplitTab extends BrowserTab {
  splitview: SplitViewWrapper | null;
  linkedPanel: string;
}

export interface SplitTabbrowser {
  tabs: SplitTab[];
  selectedTab: SplitTab;
  activeSplitView: SplitViewWrapper | null;
  tabpanels: XULElement;
  tabContainer: EventTarget;
  addTrustedTab(url: string, options: { userContextId: number; index?: number }): SplitTab;
  addTabSplitView(
    tabs: SplitTab[],
    options: { insertBefore?: SplitTab; trigger?: string },
  ): SplitViewWrapper | null;
  removeTab(tab: SplitTab, options?: { animate?: boolean }): void;
}
