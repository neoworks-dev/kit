// SPDX-License-Identifier: MPL-2.0

// Sidebar footer: shows the active workspace and opens a menu to switch,
// create, rename, recolor and delete workspaces. Reuses the container menu's
// styles so both footer menus look the same.

import { createSignal, For, Show } from "solid-js";
import { CONTAINER_COLORS } from "./containers.ts";
import { focusInputSoon } from "./focus-input.ts";
import { namedColor } from "./identity-colors.ts";
import { setSidebarMenuOpen } from "./sidebar-visibility.ts";
import { attributeFlag } from "./tab-row.tsx";
import type { Workspace } from "./types.ts";
import {
  activeWorkspace,
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

const [menuOpen, setMenuOpen] = createSignal(false);
const [creating, setCreating] = createSignal(false);
const [editingId, setEditingId] = createSignal<string | null>(null);

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

function startCreating(): void {
  setEditingId(null);
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
  createWorkspace(inputValue(event));
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
        <span
          class="nw-container-dot"
          style={{ background: namedColor(props.workspace.color) }}
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
      <input
        id={NEW_WORKSPACE_INPUT_ID}
        class="nw-container-input"
        placeholder="Workspace name"
        spellcheck={false}
        onKeyDown={handleCreateKey}
      />
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

export function WorkspaceSwitcher() {
  return (
    <>
      <Show when={menuOpen()}>
        <div class="nw-container-dismiss" onClick={closeWorkspaceMenu} />
        <WorkspaceMenu />
      </Show>
      <button
        type="button"
        class="nw-workspace-current"
        title="Switch workspace"
        onClick={toggleMenu}
      >
        <span
          class="nw-container-dot"
          style={{ background: namedColor(activeWorkspace().color) }}
        />
        <span class="nw-tab-label">{activeWorkspace().name}</span>
        <span class="nw-icon" data-icon="caret-up-down" />
      </button>
    </>
  );
}
