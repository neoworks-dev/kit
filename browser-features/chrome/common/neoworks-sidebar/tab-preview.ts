// SPDX-License-Identifier: MPL-2.0

// Hovering a tab for a moment shows a preview card beside the sidebar. Once a
// card is up, moving to another row switches it right away; clicking or
// dragging dismisses it until the pointer leaves the row.

import { createSignal } from "solid-js";
import type { BrowserTab, TabPreviewTarget } from "./types.ts";

const SHOW_DELAY_MS = 500;
// Time to reach the next row before the card hides.
const SWITCH_GRACE_MS = 80;

const [target, setTarget] = createSignal<TabPreviewTarget | null>(null);
let showTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let hoveredTab: BrowserTab | null = null;
// The tab whose card was dismissed while it is still hovered.
let dismissedTab: BrowserTab | null = null;

export const tabPreviewTarget = target;

export function hoverTab(tab: BrowserTab, anchor: Element): void {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  hoveredTab = tab;
  if (tab === dismissedTab) {
    return;
  }
  if (target()) {
    setTarget({ tab, anchor });
    return;
  }
  showTimer = setTimeout(() => setTarget({ tab, anchor }), SHOW_DELAY_MS);
}

export function unhoverTab(): void {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  hoveredTab = null;
  dismissedTab = null;
  hideTimer = setTimeout(() => setTarget(null), SWITCH_GRACE_MS);
}

// Hides the card and keeps it hidden until the pointer leaves the row.
export function dismissTabPreview(): void {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  dismissedTab = hoveredTab;
  setTarget(null);
}

export function hideTabPreview(): void {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  hoveredTab = null;
  dismissedTab = null;
  setTarget(null);
}
