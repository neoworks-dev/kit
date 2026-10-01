// SPDX-License-Identifier: MPL-2.0

// Right-click menu for the empty part of the tab list. Also holds what used
// to be the header's buttons: the container new tabs open in, and docking.

import { For } from "solid-js";
import { type Container, containers, defaultContainerId, NO_CONTAINER, setDefaultContainerId } from "./containers.ts";
import { openContextMenuAt } from "./context-menu.tsx";
import { createFolder } from "./folder-actions.ts";
import { startFolderEdit } from "./folder-editing.ts";
import { sidebarDocked, toggleSidebarDocked } from "./sidebar-docking.ts";
import { setSidebarMenuOpen } from "./sidebar-visibility.ts";
import { openNewTab } from "./tab-actions.ts";
import { tabbrowser } from "./tabbrowser.ts";

const MENU_ID = "neoworks-sidebar-list-menu";
const CONTAINER_SETTINGS_URL = "about:preferences#containers";

// Rows open their own menus first and mark the event handled; inputs (a
// folder being renamed) keep the text editing menu.
export function openSidebarContextMenu(event: MouseEvent): void {
  if (event.defaultPrevented || (event.target as Element).closest("input")) {
    return;
  }
  openContextMenuAt(MENU_ID, event);
}

// Firefox tab groups can't be empty, so a new folder starts with a new tab.
function openNewFolder(): void {
  startFolderEdit(createFolder(openNewTab()));
}

function openContainerSettings(): void {
  const browser = tabbrowser();
  browser.selectedTab = browser.addTrustedTab(CONTAINER_SETTINGS_URL, {
    userContextId: NO_CONTAINER,
  });
}

function NewTabContainerItem(props: { label: string; userContextId: number }) {
  return (
    <xul:menuitem
      type="checkbox"
      label={props.label}
      checked={defaultContainerId() === props.userContextId}
      onCommand={() => setDefaultContainerId(props.userContextId)}
    />
  );
}

// Starts at the workspace's container; switching workspaces resets it.
function NewTabContainerSubmenu() {
  return (
    <xul:menu label="Open new tabs in">
      <xul:menupopup>
        <NewTabContainerItem label="No container" userContextId={NO_CONTAINER} />
        <xul:menuseparator />
        <For each={containers()}>
          {(container: Container) => (
            <NewTabContainerItem label={container.name} userContextId={container.userContextId} />
          )}
        </For>
        <xul:menuseparator />
        <xul:menuitem label="Manage containers…" onCommand={openContainerSettings} />
      </xul:menupopup>
    </xul:menu>
  );
}

export function SidebarContextMenu() {
  return (
    <xul:menupopup
      id={MENU_ID}
      onPopupShowing={(event: Event) => {
        if (event.target === event.currentTarget) {
          setSidebarMenuOpen(MENU_ID, true);
        }
      }}
      onPopupHiding={(event: Event) => {
        if (event.target === event.currentTarget) {
          setSidebarMenuOpen(MENU_ID, false);
        }
      }}
    >
      <xul:menuitem label="New tab" onCommand={() => openNewTab()} />
      <xul:menuitem label="New folder" onCommand={openNewFolder} />
      <xul:menuseparator />
      <NewTabContainerSubmenu />
      <xul:menuitem
        type="checkbox"
        label="Keep sidebar open"
        checked={sidebarDocked()}
        onCommand={toggleSidebarDocked}
      />
    </xul:menupopup>
  );
}
