// SPDX-License-Identifier: MPL-2.0

// Sidebar footer: picks the container new tabs open in, and manages
// containers (create, rename, recolor, delete).

import { createSignal, For, Show } from "solid-js";
import {
  type Container,
  CONTAINER_COLORS,
  containerById,
  containers,
  createContainer,
  defaultContainerId,
  deleteContainer,
  NO_CONTAINER,
  setDefaultContainerId,
  updateContainer,
} from "./containers.ts";
import { namedColor } from "./identity-colors.ts";
import { setSidebarMenuOpen } from "./sidebar-visibility.ts";
import { attributeFlag } from "./tab-row.tsx";

const MENU_NAME = "container-menu";
const NEW_CONTAINER_INPUT_ID = "neoworks-new-container-input";
const RENAME_INPUT_ID = "neoworks-rename-container-input";

const [menuOpen, setMenuOpen] = createSignal(false);
const [creating, setCreating] = createSignal(false);
const [editingId, setEditingId] = createSignal<number | null>(null);

function openMenu(): void {
  setMenuOpen(true);
  setSidebarMenuOpen(MENU_NAME, true);
}

export function closeContainerMenu(): void {
  setMenuOpen(false);
  setCreating(false);
  setEditingId(null);
  setSidebarMenuOpen(MENU_NAME, false);
}

function toggleMenu(): void {
  if (menuOpen()) {
    closeContainerMenu();
    return;
  }
  openMenu();
}

// solid-xul has no refs; focus inputs by id once they are rendered.
function focusInputSoon(inputId: string): void {
  queueMicrotask(() => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  });
}

function pickDefault(userContextId: number): void {
  setDefaultContainerId(userContextId);
  closeContainerMenu();
}

function startCreating(): void {
  setEditingId(null);
  setCreating(true);
  focusInputSoon(NEW_CONTAINER_INPUT_ID);
}

function startEditing(container: Container): void {
  setCreating(false);
  setEditingId(container.userContextId);
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
  createContainer(inputValue(event));
  setCreating(false);
}

function handleRenameKey(event: KeyboardEvent, container: Container): void {
  event.stopPropagation();
  if (event.key === "Escape") {
    setEditingId(null);
    return;
  }
  if (event.key !== "Enter" || !inputValue(event)) {
    return;
  }
  updateContainer({ ...container, name: inputValue(event) });
  setEditingId(null);
}

function currentContainerName(): string {
  const container = containerById(defaultContainerId());
  if (!container) {
    return "No container";
  }
  return container.name;
}

function currentContainerColor(): string {
  const container = containerById(defaultContainerId());
  if (!container) {
    return "var(--text-faint)";
  }
  return namedColor(container.color);
}

function CheckMark(props: { userContextId: number }) {
  return (
    <Show when={defaultContainerId() === props.userContextId}>
      <span class="nw-icon nw-container-check" data-icon="check" />
    </Show>
  );
}

function ColorSwatches(props: { container: Container }) {
  return (
    <div class="nw-container-swatches">
      <For each={CONTAINER_COLORS}>
        {(color) => (
          <button
            type="button"
            class="nw-container-swatch"
            title={color}
            data-selected={attributeFlag(props.container.color === color)}
            style={{ background: namedColor(color) }}
            onClick={() => updateContainer({ ...props.container, color })}
          />
        )}
      </For>
    </div>
  );
}

function ContainerEditor(props: { container: Container }) {
  return (
    <div class="nw-container-editor">
      <div class="nw-container-editor-row">
        <input
          id={RENAME_INPUT_ID}
          class="nw-container-input"
          value={props.container.name}
          spellcheck={false}
          onKeyDown={(event: KeyboardEvent) => handleRenameKey(event, props.container)}
        />
        <button
          type="button"
          class="nw-icon-button nw-container-delete"
          title="Delete container"
          onClick={() => deleteContainer(props.container)}
        >
          <span class="nw-icon" data-icon="trash" />
        </button>
      </div>
      <ColorSwatches container={props.container} />
    </div>
  );
}

function ContainerOption(props: { container: Container }) {
  return (
    <Show
      when={editingId() !== props.container.userContextId}
      fallback={<ContainerEditor container={props.container} />}
    >
      <div
        class="nw-container-option"
        onClick={() => pickDefault(props.container.userContextId)}
      >
        <span
          class="nw-container-dot"
          style={{ background: namedColor(props.container.color) }}
        />
        <span class="nw-tab-label">{props.container.name}</span>
        <CheckMark userContextId={props.container.userContextId} />
        <button
          type="button"
          class="nw-icon-button nw-container-edit"
          title="Edit container"
          onClick={(event: MouseEvent) => {
            event.stopPropagation();
            startEditing(props.container);
          }}
        >
          <span class="nw-icon" data-icon="pencil-simple" />
        </button>
      </div>
    </Show>
  );
}

function NewContainerRow() {
  return (
    <Show
      when={creating()}
      fallback={
        <div class="nw-container-option nw-container-new" onClick={startCreating}>
          <span class="nw-icon" data-icon="plus" />
          <span class="nw-tab-label">New container</span>
        </div>
      }
    >
      <input
        id={NEW_CONTAINER_INPUT_ID}
        class="nw-container-input"
        placeholder="Container name"
        spellcheck={false}
        onKeyDown={handleCreateKey}
      />
    </Show>
  );
}

function ContainerMenu() {
  return (
    <div
      class="nw-container-menu nw-glass"
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === "Escape") {
          closeContainerMenu();
        }
      }}
    >
      <div
        class="nw-container-option"
        onClick={() => pickDefault(NO_CONTAINER)}
      >
        <span class="nw-container-dot" style={{ background: "var(--text-faint)" }} />
        <span class="nw-tab-label">No container</span>
        <CheckMark userContextId={NO_CONTAINER} />
      </div>
      <For each={containers()}>
        {(container) => <ContainerOption container={container} />}
      </For>
      <div class="nw-container-divider" />
      <NewContainerRow />
    </div>
  );
}

export function ContainerBar() {
  return (
    <div class="nw-container-bar">
      <Show when={menuOpen()}>
        <div class="nw-container-dismiss" onClick={closeContainerMenu} />
        <ContainerMenu />
      </Show>
      <button
        type="button"
        class="nw-icon-button nw-container-current"
        title={`Container for new tabs: ${currentContainerName()}`}
        onClick={toggleMenu}
      >
        <span class="nw-container-dot" style={{ background: currentContainerColor() }} />
      </button>
    </div>
  );
}
