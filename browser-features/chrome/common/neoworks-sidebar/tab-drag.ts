// SPDX-License-Identifier: MPL-2.0

import { moveTabOnto } from "./tab-actions.ts";
import type { BrowserTab } from "./types.ts";

const DRAG_TYPE = "application/x-neoworks-tab";

let draggedTab: BrowserTab | null = null;

export function startTabDrag(event: DragEvent, tab: BrowserTab): void {
  draggedTab = tab;
  event.dataTransfer?.setData(DRAG_TYPE, tab.label);
  event.dataTransfer?.setDragImage(event.currentTarget as Element, 12, 12);
}

export function allowTabDrop(event: DragEvent): void {
  if (!draggedTab) {
    return;
  }
  event.preventDefault();
}

export function dropTabOnto(event: DragEvent, targetTab: BrowserTab): void {
  if (!draggedTab) {
    return;
  }
  event.preventDefault();
  moveTabOnto(draggedTab, targetTab);
  draggedTab = null;
}

export function endTabDrag(): void {
  draggedTab = null;
}
