// SPDX-License-Identifier: MPL-2.0

// Sidebar footer: one icon per workspace to switch in one click (or to drop
// a tab on to move it there), then a +
// for a new one. The active icon (or a right click) opens a menu to create,
// rename, recolor and delete workspaces. Reuses the container menu's
// styles so both footer menus look the same.

import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { CONTAINER_COLORS, containers, NO_CONTAINER } from "./containers.ts";
import { focusInputSoon } from "./focus-input.ts";
import { isEmojiIcon, WORKSPACE_ICONS, workspaceIconMask } from "./workspace-icons.ts";
import { namedColor } from "./identity-colors.ts";
import { sidebarDocked } from "./sidebar-docking.ts";
import { setSidebarMenuOpen } from "./sidebar-visibility.ts";
import { attributeFlag } from "./tab-row.tsx";
import {
  allowWorkspaceDrop,
  dropOntoWorkspace,
  isDropTarget,
  leaveDrop,
  workspaceDrop,
} from "./tab-drag.ts";
import type { Workspace } from "./types.ts";
import {
  activeWorkspaceId,
  createWorkspace,
  deleteWorkspace,
  switchWorkspace,
  updateWorkspace,
  workspaces,
} from "./workspaces.ts";

const MENU_NAME = "workspace-menu";
const NEW_WORKSPACE_INPUT_ID = "neoworks-new-workspace-input";
const RENAME_INPUT_ID = "neoworks-rename-workspace-input";
const ICON_ROW_ID = "neoworks-workspace-icons";
// A wheel notch in line mode scrolls the icon row by about one icon.
const WHEEL_LINE_PX = 30;

const [menuOpen, setMenuOpen] = createSignal(false);
const [creating, setCreating] = createSignal(false);
const [editingId, setEditingId] = createSignal<string | null>(null);
const [newIcon, setNewIcon] = createSignal(WORKSPACE_ICONS[0]);
// null: a container of the workspace's own; otherwise a container to share.
const [newContainer, setNewContainer] = createSignal<number | null>(null);
// Whether the icon row continues past its left or right edge.
const [overflowStart, setOverflowStart] = createSignal(false);
const [overflowEnd, setOverflowEnd] = createSignal(false);

function openMenu(): void {
  setMenuOpen(true);
  setSidebarMenuOpen(MENU_NAME, true);
}

export function closeWorkspaceMenu(): void {
  setMenuOpen(false);
  setCreating(false);
  setEditingId(null);
  setSidebarMenuOpen(MENU_NAME, false);
}

function toggleMenu(): void {
  if (menuOpen()) {
    closeWorkspaceMenu();
    return;
  }
  openMenu();
}

function pickWorkspace(workspaceId: string): void {
  switchWorkspace(workspaceId);
  closeWorkspaceMenu();
}

// The footer's + button: the menu, straight in its "new workspace" form.
function openNewWorkspace(): void {
  openMenu();
  startCreating();
}

function startCreating(): void {
  setEditingId(null);
  setNewIcon(WORKSPACE_ICONS[0]);
  setNewContainer(null);
  setCreating(true);
  focusInputSoon(NEW_WORKSPACE_INPUT_ID);
}

function startEditing(workspace: Workspace): void {
  setCreating(false);
  setEditingId(workspace.id);
  focusInputSoon(RENAME_INPUT_ID);
}

function inputValue(event: KeyboardEvent): string {
  return (event.currentTarget as HTMLInputElement).value.trim();
}

function handleCreateKey(event: KeyboardEvent): void {
  event.stopPropagation();
  if (event.key === "Escape") {
    setCreating(false);
    return;
  }
  if (event.key !== "Enter" || !inputValue(event)) {
    return;
  }
  createWorkspace(inputValue(event), newIcon(), newContainer());
  closeWorkspaceMenu();
}

function handleRenameKey(event: KeyboardEvent, workspace: Workspace): void {
  event.stopPropagation();
  if (event.key === "Escape") {
    setEditingId(null);
    return;
  }
  if (event.key !== "Enter" || !inputValue(event)) {
    return;
  }
  updateWorkspace({ ...workspace, name: inputValue(event) });
  setEditingId(null);
}

function CheckMark(props: { workspaceId: string }) {
  return (
    <Show when={activeWorkspaceId() === props.workspaceId}>
      <span class="nw-icon nw-container-check" data-icon="check" />
    </Show>
  );
}

// A Phosphor icon, or the emoji of a workspace imported from Zen. `color`
// tints the Phosphor icon; emoji keep their own colors.
function WorkspaceIcon(props: { icon: string; color?: string }) {
  return (
    <Show
      when={isEmojiIcon(props.icon)}
      fallback={
        <span
          class="nw-icon"
          style={{ color: props.color ?? "", "mask-image": workspaceIconMask(props.icon) }}
        />
      }
    >
      <span class="nw-icon nw-workspace-emoji">{props.icon}</span>
    </Show>
  );
}

// Picking an icon hands focus back to the name field, so Enter still saves.
function IconPicker(props: {
  selected: string;
  inputId: string;
  onPick: (icon: string) => void;
}) {
  return (
    <div class="nw-icon-picker">
      <For each={WORKSPACE_ICONS}>
        {(icon) => (
          <button
            type="button"
            class="nw-icon-button nw-icon-choice"
            title={icon}
            data-selected={attributeFlag(props.selected === icon)}
            onClick={() => {
              props.onPick(icon);
              focusInputSoon(props.inputId);
            }}
          >
            <span class="nw-icon" style={{ "mask-image": workspaceIconMask(icon) }} />
          </button>
        )}
      </For>
    </div>
  );
}

function ColorSwatches(props: { workspace: Workspace }) {
  return (
    <div class="nw-container-swatches">
      <For each={CONTAINER_COLORS}>
        {(color) => (
          <button
            type="button"
            class="nw-container-swatch"
            title={color}
            data-selected={attributeFlag(props.workspace.color === color)}
            style={{ background: namedColor(color) }}
            onClick={() => updateWorkspace({ ...props.workspace, color })}
          />
        )}
      </For>
    </div>
  );
}

function WorkspaceEditor(props: { workspace: Workspace }) {
  return (
    <div class="nw-container-editor">
      <div class="nw-container-editor-row">
        <input
          id={RENAME_INPUT_ID}
          class="nw-container-input"
          value={props.workspace.name}
          spellcheck={false}
          onKeyDown={(event: KeyboardEvent) => handleRenameKey(event, props.workspace)}
        />
        <Show when={workspaces().length > 1}>
          <button
            type="button"
            class="nw-icon-button nw-container-delete"
            title="Delete workspace"
            onClick={() => deleteWorkspace(props.workspace)}
          >
            <span class="nw-icon" data-icon="trash" />
          </button>
        </Show>
      </div>
      <IconPicker
        selected={props.workspace.icon}
        inputId={RENAME_INPUT_ID}
        onPick={(icon) => updateWorkspace({ ...props.workspace, icon })}
      />
      <ColorSwatches workspace={props.workspace} />
    </div>
  );
}

function WorkspaceOption(props: { workspace: Workspace }) {
  return (
    <Show
      when={editingId() !== props.workspace.id}
      fallback={<WorkspaceEditor workspace={props.workspace} />}
    >
      <div class="nw-container-option" onClick={() => pickWorkspace(props.workspace.id)}>
        <WorkspaceIcon
          icon={props.workspace.icon}
          color={namedColor(props.workspace.color)}
        />
        <span class="nw-tab-label">{props.workspace.name}</span>
        <CheckMark workspaceId={props.workspace.id} />
        <button
          type="button"
          class="nw-icon-button nw-container-edit"
          title="Edit workspace"
          onClick={(event: MouseEvent) => {
            event.stopPropagation();
            startEditing(props.workspace);
          }}
        >
          <span class="nw-icon" data-icon="pencil-simple" />
        </button>
      </div>
    </Show>
  );
}

function ContainerChip(props: {
  label: string;
  color: string;
  title: string;
  choice: number | null;
}) {
  return (
    <button
      type="button"
      class="nw-container-chip"
      title={props.title}
      data-selected={attributeFlag(newContainer() === props.choice)}
      style={{ "--nw-chip-color": props.color }}
      onClick={() => {
        setNewContainer(props.choice);
        focusInputSoon(NEW_WORKSPACE_INPUT_ID);
      }}
    >
      {props.label}
    </button>
  );
}

// Which container the new workspace's tabs open in.
function ContainerChoice() {
  return (
    <div class="nw-container-choice">
      <span class="nw-container-choice-label">Container</span>
      <ContainerChip
        label="New"
        color="var(--text-muted)"
        title="A container of its own, named after the workspace"
        choice={null}
      />
      <ContainerChip
        label="None"
        color="var(--text-dim)"
        title="No container"
        choice={NO_CONTAINER}
      />
      <For each={containers()}>
        {(container) => (
          <ContainerChip
            label={container.name}
            color={namedColor(container.color)}
            title={`Share the ${container.name} container`}
            choice={container.userContextId}
          />
        )}
      </For>
    </div>
  );
}

function NewWorkspaceRow() {
  return (
    <Show
      when={creating()}
      fallback={
        <div class="nw-container-option nw-container-new" onClick={startCreating}>
          <span class="nw-icon" data-icon="plus" />
          <span class="nw-tab-label">New workspace</span>
        </div>
      }
    >
      <div class="nw-container-editor">
        <input
          id={NEW_WORKSPACE_INPUT_ID}
          class="nw-container-input"
          placeholder="Workspace name"
          spellcheck={false}
          onKeyDown={handleCreateKey}
        />
        <IconPicker selected={newIcon()} inputId={NEW_WORKSPACE_INPUT_ID} onPick={setNewIcon} />
        <ContainerChoice />
      </div>
    </Show>
  );
}

function WorkspaceMenu() {
  return (
    <div
      class="nw-container-menu nw-glass"
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === "Escape") {
          closeWorkspaceMenu();
        }
      }}
    >
      <For each={workspaces()}>
        {(workspace) => <WorkspaceOption workspace={workspace} />}
      </For>
      <div class="nw-container-divider" />
      <NewWorkspaceRow />
    </div>
  );
}

function workspaceTitle(workspace: Workspace): string {
  if (activeWorkspaceId() === workspace.id) {
    return `${workspace.name} (click to manage workspaces)`;
  }
  return workspace.name;
}

// The active icon opens the menu; any other switches in one click.
function handleIconClick(workspace: Workspace): void {
  if (activeWorkspaceId() === workspace.id) {
    toggleMenu();
    return;
  }
  switchWorkspace(workspace.id);
}

function openMenuFromContext(event: MouseEvent): void {
  event.preventDefault();
  openMenu();
}

// solid-xul has no refs; the row is looked up by id.
function iconRow(): HTMLElement | null {
  return document.getElementById(ICON_ROW_ID) as HTMLElement | null;
}

function measureOverflow(): void {
  const row = iconRow();
  if (!row) {
    return;
  }
  setOverflowStart(row.scrollLeft > 0);
  setOverflowEnd(row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
}

// Scrolls the row just enough to show the active workspace's icon.
function revealActiveIcon(): void {
  const row = iconRow();
  const icon = row?.querySelector("[data-selected]");
  if (!row || !icon) {
    return;
  }
  const rowBox = row.getBoundingClientRect();
  const iconBox = icon.getBoundingClientRect();
  if (iconBox.left < rowBox.left) {
    row.scrollLeft -= rowBox.left - iconBox.left;
  } else if (iconBox.right > rowBox.right) {
    row.scrollLeft += iconBox.right - rowBox.right;
  }
}

// The vertical wheel scrolls the row sideways while it overflows.
function scrollIconRow(event: WheelEvent): void {
  const row = event.currentTarget as HTMLElement;
  const delta = event.deltaY || event.deltaX;
  if (row.scrollWidth <= row.clientWidth || delta === 0) {
    return;
  }
  event.preventDefault();
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    row.scrollLeft += delta * WHEEL_LINE_PX;
    return;
  }
  row.scrollLeft += delta;
}

export function WorkspaceSwitcher() {
  createEffect(() => {
    workspaces();
    activeWorkspaceId();
    sidebarDocked();
    const frame = requestAnimationFrame(() => {
      revealActiveIcon();
      measureOverflow();
    });
    onCleanup(() => cancelAnimationFrame(frame));
  });

  return (
    <>
      <Show when={menuOpen()}>
        <div class="nw-container-dismiss" onClick={closeWorkspaceMenu} />
        <WorkspaceMenu />
      </Show>
      <div
        id={ICON_ROW_ID}
        class="nw-workspace-icons"
        data-overflow-start={attributeFlag(overflowStart())}
        data-overflow-end={attributeFlag(overflowEnd())}
        onWheel={scrollIconRow}
        onScroll={measureOverflow}
      >
        <For each={workspaces()}>
          {(workspace) => (
            <button
              type="button"
              class="nw-workspace-icon"
              title={workspaceTitle(workspace)}
              data-selected={attributeFlag(activeWorkspaceId() === workspace.id)}
              data-drop-target={attributeFlag(isDropTarget(workspaceDrop(workspace.id)))}
              style={{ "--nw-workspace-color": namedColor(workspace.color) }}
              onClick={() => handleIconClick(workspace)}
              onContextMenu={openMenuFromContext}
              onDragOver={(event: DragEvent) => allowWorkspaceDrop(event, workspace.id)}
              onDragLeave={() => leaveDrop(workspaceDrop(workspace.id))}
              onDrop={(event: DragEvent) => dropOntoWorkspace(event, workspace.id)}
            >
              <WorkspaceIcon icon={workspace.icon} />
            </button>
          )}
        </For>
      </div>
      <button
        type="button"
        class="nw-icon-button nw-footer-button"
        title="New workspace"
        onClick={openNewWorkspace}
      >
        <span class="nw-icon" data-icon="plus" />
      </button>
    </>
  );
}
