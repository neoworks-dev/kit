// SPDX-License-Identifier: MPL-2.0

// Drag and drop in the tab list. A tab dropped on a tab takes its place (and
// joins or leaves its folder), on a folder header it joins that folder, and
// below the list it moves out of any folder to the end. Folders move as a
// whole the same way.

import { createSignal } from "solid-js";
import {
  moveFolderOnto,
  moveFolderToListEnd,
  moveTabIntoFolder,
  moveTabToListEnd,
} from "./folder-actions.ts";
import { moveTabOnto } from "./tab-actions.ts";
import type { BrowserTab, BrowserTabGroup, TabListElement } from "./types.ts";

const DRAG_TYPE = "application/x-neoworks-tab";

export const LIST_END = "list-end";

type DraggedItem =
  | { kind: "tab"; tab: BrowserTab }
  | { kind: "folder"; group: BrowserTabGroup };

type DropTarget = TabListElement | typeof LIST_END;

let draggedItem: DraggedItem | null = null;
const [dropTarget, setDropTarget] = createSignal<DropTarget | null>(null);

export function isDropTarget(target: DropTarget): boolean {
  return dropTarget() === target;
}

function beginDrag(event: DragEvent, item: DraggedItem, label: string): void {
  draggedItem = item;
  event.dataTransfer?.setData(DRAG_TYPE, label);
  event.dataTransfer?.setDragImage(event.currentTarget as Element, 12, 12);
}

export function startTabDrag(event: DragEvent, tab: BrowserTab): void {
  beginDrag(event, { kind: "tab", tab }, tab.label);
}

export function startFolderDrag(event: DragEvent, group: BrowserTabGroup): void {
  beginDrag(event, { kind: "folder", group }, group.label);
}

export function allowDrop(event: DragEvent, target: DropTarget): void {
  if (!draggedItem) {
    return;
  }
  event.preventDefault();
  setDropTarget(target);
}

export function leaveDrop(target: DropTarget): void {
  if (dropTarget() === target) {
    setDropTarget(null);
  }
}

export function endDrag(): void {
  draggedItem = null;
  setDropTarget(null);
}

function takeDraggedItem(event: DragEvent): DraggedItem | null {
  const item = draggedItem;
  endDrag();
  if (item) {
    event.preventDefault();
  }
  return item;
}

export function dropOntoTab(event: DragEvent, tab: BrowserTab): void {
  const item = takeDraggedItem(event);
  if (!item) {
    return;
  }
  if (item.kind === "tab") {
    moveTabOnto(item.tab, tab);
    return;
  }
  moveFolderOnto(item.group, tab);
}

export function dropOntoFolder(event: DragEvent, group: BrowserTabGroup): void {
  const item = takeDraggedItem(event);
  if (!item) {
    return;
  }
  if (item.kind === "tab") {
    moveTabIntoFolder(item.tab, group);
    return;
  }
  moveFolderOnto(item.group, group);
}

export function dropAtListEnd(event: DragEvent): void {
  const item = takeDraggedItem(event);
  if (!item) {
    return;
  }
  if (item.kind === "tab") {
    moveTabToListEnd(item.tab);
    return;
  }
  moveFolderToListEnd(item.group);
}
