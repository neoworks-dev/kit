// SPDX-License-Identifier: MPL-2.0

// A folder in the tab list: a header that collapses, drags, renames in place
// and moves with Alt+Up/Down, followed by its tabs.

import { For, Show } from "solid-js";
import {
  DEFAULT_FOLDER_LABEL,
  FOLDER_COLORS,
  moveFolderBy,
  recolorFolder,
  renameFolder,
  toggleFolderCollapsed,
} from "./folder-actions.ts";
import { openFolderContextMenu } from "./folder-context-menu.tsx";
import {
  editedFolder,
  FOLDER_NAME_INPUT_ID,
  startFolderEdit,
  stopFolderEdit,
} from "./folder-editing.ts";
import { namedColor } from "./identity-colors.ts";
import {
  allowDrop,
  dropOntoFolder,
  endDrag,
  isDropTarget,
  leaveDrop,
  startFolderDrag,
} from "./tab-drag.ts";
import { attributeFlag, tabReader, TabRow } from "./tab-row.tsx";
import type { BrowserTabGroup, TabState } from "./types.ts";

function headerId(group: BrowserTabGroup): string {
  return `neoworks-folder-${group.id}`;
}

// Moving re-inserts the header, which drops its focus.
function focusHeaderSoon(group: BrowserTabGroup): void {
  setTimeout(() => document.getElementById(headerId(group))?.focus(), 0);
}

function moveStepForKey(event: KeyboardEvent): number {
  if (!event.altKey) {
    return 0;
  }
  if (event.key === "ArrowUp") {
    return -1;
  }
  if (event.key === "ArrowDown") {
    return 1;
  }
  return 0;
}

function handleHeaderKey(event: KeyboardEvent, group: BrowserTabGroup): void {
  const step = moveStepForKey(event);
  if (step !== 0) {
    event.preventDefault();
    moveFolderBy(group, step);
    focusHeaderSoon(group);
    return;
  }
  if (event.key === "F2") {
    event.preventDefault();
    startFolderEdit(group);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    toggleFolderCollapsed(group);
  }
}

function inputValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement).value.trim();
}

function commitName(event: Event, group: BrowserTabGroup): void {
  // Escape already closed the editor; the blur that follows must not save.
  if (editedFolder() !== group) {
    return;
  }
  const name = inputValue(event);
  if (name) {
    renameFolder(group, name);
  }
  stopFolderEdit();
}

function handleNameKey(event: KeyboardEvent, group: BrowserTabGroup): void {
  event.stopPropagation();
  if (event.key === "Escape") {
    stopFolderEdit();
    return;
  }
  if (event.key === "Enter") {
    commitName(event, group);
  }
}

function FolderSwatches(props: { group: BrowserTabGroup; tabState: TabState }) {
  const read = tabReader(props.tabState);
  const currentColor = read(() => props.group.color);

  return (
    <div class="nw-container-swatches">
      <For each={FOLDER_COLORS}>
        {(color) => (
          <button
            type="button"
            class="nw-container-swatch"
            title={color}
            data-selected={attributeFlag(currentColor() === color)}
            style={{ background: namedColor(color) }}
            // Keeps focus in the name field so the editor stays open.
            onMouseDown={(event: MouseEvent) => event.preventDefault()}
            onClick={() => recolorFolder(props.group, color)}
          />
        )}
      </For>
    </div>
  );
}

function FolderEditor(props: { group: BrowserTabGroup; tabState: TabState }) {
  return (
    <div class="nw-container-editor">
      <input
        id={FOLDER_NAME_INPUT_ID}
        class="nw-container-input"
        value={props.group.label}
        placeholder="Folder name"
        spellcheck={false}
        onKeyDown={(event: KeyboardEvent) => handleNameKey(event, props.group)}
        onBlur={(event: FocusEvent) => commitName(event, props.group)}
      />
      <FolderSwatches group={props.group} tabState={props.tabState} />
    </div>
  );
}

function folderIcon(collapsed: boolean): string {
  if (collapsed) {
    return "folder";
  }
  return "folder-open";
}

function FolderHeader(props: { group: BrowserTabGroup; tabState: TabState }) {
  const group = props.group;
  const read = tabReader(props.tabState);

  const label = read(() => group.label || DEFAULT_FOLDER_LABEL);
  const collapsed = read(() => group.collapsed);
  const color = read(() => namedColor(group.color));
  const tabCount = read(() => group.tabs.filter((tab) => !tab.hidden).length);

  return (
    <div
      id={headerId(group)}
      class="nw-group-header"
      tabindex="0"
      draggable="true"
      data-drop-target={attributeFlag(isDropTarget(group))}
      onClick={() => toggleFolderCollapsed(group)}
      onDblClick={() => startFolderEdit(group)}
      onKeyDown={(event: KeyboardEvent) => handleHeaderKey(event, group)}
      onContextMenu={(event: MouseEvent) => openFolderContextMenu(event, group)}
      onDragStart={(event: DragEvent) => startFolderDrag(event, group)}
      onDragOver={(event: DragEvent) => allowDrop(event, group)}
      onDragLeave={() => leaveDrop(group)}
      onDrop={(event: DragEvent) => dropOntoFolder(event, group)}
      onDragEnd={endDrag}
    >
      <span
        class="nw-icon nw-group-chevron"
        data-icon="caret-right"
        data-collapsed={attributeFlag(collapsed())}
      />
      <span
        class="nw-icon nw-folder-icon"
        data-icon={folderIcon(collapsed())}
        style={{ color: color() }}
      />
      <span class="nw-tab-label">{label()}</span>
      <span class="nw-group-count">{tabCount()}</span>
    </div>
  );
}

export function FolderRow(props: { group: BrowserTabGroup; tabState: TabState }) {
  const group = props.group;
  const read = tabReader(props.tabState);

  const collapsed = read(() => group.collapsed);
  const tabs = read(() => group.tabs.filter((tab) => !tab.hidden));

  return (
    <div class="nw-group">
      <Show
        when={editedFolder() === group}
        fallback={<FolderHeader group={group} tabState={props.tabState} />}
      >
        <FolderEditor group={group} tabState={props.tabState} />
      </Show>
      <Show when={!collapsed()}>
        <div class="nw-group-tabs">
          <For each={tabs()}>
            {(tab) => <TabRow tab={tab} tabState={props.tabState} />}
          </For>
        </div>
      </Show>
    </div>
  );
}
