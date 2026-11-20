// SPDX-License-Identifier: MPL-2.0

// Drag and drop in the tab list. Over a tab, a line shows where the dragged
// tab lands: above it on the row's upper half, below it on the lower half,
// inside the row's folder if it has one. Over a folder header, the top third
// means above the folder and the rest into it. Below the list, it moves out
// of any folder to the end. Folders move as a whole, between rows only.
// Tabs dropped on the Essentials or pinned grid join it, and on a workspace
// icon in the footer they move to that workspace. The floating sidebar stays
// open for the whole drag.

import { createSignal } from "solid-js";
import {
  moveFolderNextTo,
  moveFolderToListEnd,
  moveTabBeforeFolder,
  moveTabIntoFolder,
  moveTabToListEnd,
} from "./folder-actions.ts";
import { addToEssentials, essentialsScope, isEssential } from "./essentials.ts";
import { setSidebarMenuOpen } from "./sidebar-visibility.ts";
import { moveTabNextTo, pinTab } from "./tab-actions.ts";
import type {
  BrowserTab,
  BrowserTabGroup,
  DropPosition,
  EdgePosition,
  TabListElement,
} from "./types.ts";
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

// Of a folder header, the top part that means "above the folder".
const FOLDER_BEFORE_SHARE = 1 / 3;

let draggedItem: DraggedItem | null = null;
const [drop, setDrop] = createSignal<
  { target: DropTarget; position: DropPosition } | null
>(
  null,
);
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
  return drop()?.target === target;
}

// Where the dragged item lands relative to `target`, while over it.
export function dropPositionOf(target: DropTarget): DropPosition | undefined {
  const current = drop();
  if (current?.target !== target) {
    return undefined;
  }
  return current.position;
}

// Rows split at half height; Essentials tiles sit side by side, so they
// split at half width, except in the compact sidebar's single column.
function edgePosition(event: DragEvent): EdgePosition {
  const element = event.currentTarget as Element;
  const rect = element.getBoundingClientRect();
  if (
    element.matches(".nw-essential-tile") &&
    !element.closest("#neoworks-sidebar[data-compact]")
  ) {
    return event.clientX < rect.left + rect.width / 2 ? "before" : "after";
  }
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function folderHeaderPosition(event: DragEvent): DropPosition {
  const rect = (event.currentTarget as Element).getBoundingClientRect();
  if (event.clientY < rect.top + rect.height * FOLDER_BEFORE_SHARE) {
    return "before";
  }
  return "inside";
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

export function startFolderDrag(
  event: DragEvent,
  group: BrowserTabGroup,
): void {
  beginDrag(event, { kind: "folder", group }, group.label);
}

export function allowDrop(
  event: DragEvent,
  target: DropTarget,
  position: DropPosition = "inside",
): void {
  if (!draggedItem) {
    return;
  }
  event.preventDefault();
  const current = drop();
  if (current?.target !== target || current.position !== position) {
    setDrop({ target, position });
  }
}

// Folders only move between top-level rows, so a tab inside a folder is no
// place for one.
export function allowTabDrop(event: DragEvent, tab: BrowserTab): void {
  if (!draggedItem) {
    return;
  }
  if (draggedItem.kind === "tab" && draggedItem.tab === tab) {
    event.preventDefault();
    setDrop(null);
    return;
  }
  if (draggedItem.kind === "folder" && (tab.group || tab.pinned)) {
    return;
  }
  allowDrop(event, tab, edgePosition(event));
}

export function allowFolderDrop(
  event: DragEvent,
  group: BrowserTabGroup,
): void {
  if (!draggedItem) {
    return;
  }
  if (draggedItem.kind === "folder") {
    if (draggedItem.group === group) {
      event.preventDefault();
      setDrop(null);
      return;
    }
    allowDrop(event, group, edgePosition(event));
    return;
  }
  allowDrop(event, group, folderHeaderPosition(event));
}

export function leaveDrop(target: DropTarget): void {
  if (drop()?.target === target) {
    setDrop(null);
  }
}

export function endDrag(): void {
  if (draggedItem) {
    setSidebarMenuOpen(DRAG_HOLD, false);
  }
  draggedItem = null;
  setDrop(null);
  setDraggingTab(false);
}

// The dragged item and where over `target` it was dropped; null when the
// pointer showed no place for it there.
function takeDrop(
  event: DragEvent,
  target: DropTarget,
): { item: DraggedItem; position: DropPosition } | null {
  const item = draggedItem;
  const position = dropPositionOf(target);
  endDrag();
  if (!item) {
    return null;
  }
  event.preventDefault();
  if (!position) {
    return null;
  }
  return { item, position };
}

function edgeOf(position: DropPosition): EdgePosition {
  return position === "before" ? "before" : "after";
}

export function dropOntoTab(event: DragEvent, tab: BrowserTab): void {
  const dropped = takeDrop(event, tab);
  if (!dropped) {
    return;
  }
  const edge = edgeOf(dropped.position);
  if (dropped.item.kind === "tab") {
    moveTabNextTo(dropped.item.tab, tab, edge);
    return;
  }
  moveFolderNextTo(dropped.item.group, tab, edge);
}

export function dropOntoFolder(event: DragEvent, group: BrowserTabGroup): void {
  const dropped = takeDrop(event, group);
  if (!dropped) {
    return;
  }
  const { item, position } = dropped;
  if (item.kind === "folder") {
    moveFolderNextTo(item.group, group, edgeOf(position));
    return;
  }
  if (position === "before") {
    moveTabBeforeFolder(item.tab, group);
    return;
  }
  moveTabIntoFolder(item.tab, group);
}

function takeDraggedItem(event: DragEvent): DraggedItem | null {
  const item = draggedItem;
  endDrag();
  if (item) {
    event.preventDefault();
  }
  return item;
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
export function allowGridDrop(
  event: DragEvent,
  grid: typeof ESSENTIALS | typeof PINNED,
): void {
  if (draggedItem?.kind !== "tab") {
    return;
  }
  allowDrop(event, grid);
}

export function dropIntoGrid(
  event: DragEvent,
  grid: typeof ESSENTIALS | typeof PINNED,
): void {
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

// Shared Essentials are in every workspace already.
export function allowWorkspaceDrop(
  event: DragEvent,
  workspaceId: string,
): void {
  const tab = draggedTab();
  if (
    !tab || (isEssential(tab) && essentialsScope() === "shared") ||
    workspaceId === activeWorkspaceId()
  ) {
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
