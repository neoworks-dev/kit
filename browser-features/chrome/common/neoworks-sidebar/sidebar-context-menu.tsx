// SPDX-License-Identifier: MPL-2.0

// Right-click menu for the empty part of the tab list.

import { openContextMenuAt } from "./context-menu.tsx";
import { createFolder } from "./folder-actions.ts";
import { startFolderEdit } from "./folder-editing.ts";
import { setSidebarMenuOpen } from "./sidebar-visibility.ts";
import { openNewTab } from "./tab-actions.ts";

const MENU_ID = "neoworks-sidebar-list-menu";

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
    </xul:menupopup>
  );
}
