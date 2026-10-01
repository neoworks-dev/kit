// SPDX-License-Identifier: MPL-2.0

// Drag and drop in the tab list. A tab dropped on a tab takes its place (and
// joins or leaves its folder), on a folder header it joins that folder, and
// below the list it moves out of any folder to the end. Folders move as a
// whole the same way. Tabs dropped on the Essentials or pinned grid join it,
// and on a workspace icon in the footer they move to that workspace. The
// floating sidebar stays open for the whole drag.

import { createSignal } from "solid-js";
import {
  moveFolderOnto,
  moveFolderToListEnd,
  moveTabIntoFolder,
  moveTabToListEnd,
} from "./folder-actions.ts";
import { addToEssentials, isEssential } from "./essentials.ts";
import { setSidebarMenuOpen } from "./sidebar-visibility.ts";
import { moveTabOnto, pinTab } from "./tab-actions.ts";
import type { BrowserTab, BrowserTabGroup, TabListElement } from "./types.ts";
import { activeWorkspaceId, moveTabToWorkspace } from "./workspaces.ts";

const DRAG_TYPE = "application/x-neoworks-tab";
// Keeps the floating sidebar open, like an open menu does.
const DRAG_HOLD = "tab-drag";

export const LIST_END = "list-end";
export const ESSENTIALS = "essentials";
export const PINNED = "pinned";

type Section = typeof LIST_END | typeof ESSENTIALS | typeof PINNED;

type DraggedItem =
  | { kind: "tab"; tab: BrowserTab }
  | { kind: "folder"; group: BrowserTabGroup };

// A workspace icon, by workspace id.
type WorkspaceDrop = `workspace:${string}`;

type DropTarget = TabListElement | Section | WorkspaceDrop;

let draggedItem: DraggedItem | null = null;
const [dropTarget, setDropTarget] = createSignal<DropTarget | null>(null);
// A sidebar tab is being dragged: empty grids show where to drop.
const [draggingTab, setDraggingTab] = createSignal(false);

export { draggingTab };

export function draggedTab(): BrowserTab | null {
  if (draggedItem?.kind === "tab") {
    return draggedItem.tab;
  }
  return null;
}

export function isDropTarget(target: DropTarget): boolean {
  return dropTarget() === target;
}

function beginDrag(event: DragEvent, item: DraggedItem, label: string): void {
  draggedItem = item;
  setSidebarMenuOpen(DRAG_HOLD, true);
  event.dataTransfer?.setData(DRAG_TYPE, label);
  event.dataTransfer?.setDragImage(event.currentTarget as Element, 12, 12);
}

export function startTabDrag(event: DragEvent, tab: BrowserTab): void {
  beginDrag(event, { kind: "tab", tab }, tab.label);
  setDraggingTab(true);
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
  if (draggedItem) {
    setSidebarMenuOpen(DRAG_HOLD, false);
  }
  draggedItem = null;
  setDropTarget(null);
  setDraggingTab(false);
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

// Only tabs join the grids; folders stay in the list.
export function allowGridDrop(event: DragEvent, grid: typeof ESSENTIALS | typeof PINNED): void {
  if (draggedItem?.kind !== "tab") {
    return;
  }
  allowDrop(event, grid);
}

export function dropIntoGrid(event: DragEvent, grid: typeof ESSENTIALS | typeof PINNED): void {
  const item = takeDraggedItem(event);
  if (item?.kind !== "tab") {
    return;
  }
  if (grid === ESSENTIALS) {
    addToEssentials(item.tab);
    return;
  }
  pinTab(item.tab);
}

export function workspaceDrop(workspaceId: string): WorkspaceDrop {
  return `workspace:${workspaceId}`;
}

// Essentials are in every workspace already.
export function allowWorkspaceDrop(event: DragEvent, workspaceId: string): void {
  const tab = draggedTab();
  if (!tab || isEssential(tab) || workspaceId === activeWorkspaceId()) {
    return;
  }
  allowDrop(event, workspaceDrop(workspaceId));
}

export function dropOntoWorkspace(event: DragEvent, workspaceId: string): void {
  const item = takeDraggedItem(event);
  if (item?.kind === "tab") {
    moveTabToWorkspace(item.tab, workspaceId);
  }
}
