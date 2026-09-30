// SPDX-License-Identifier: MPL-2.0

// Right-click menu for a folder header. Deleting a folder keeps its tabs;
// closing them is a separate, explicit item.

import { createSignal, For } from "solid-js";
import { openContextMenuAt } from "./context-menu.tsx";
import {
  closeFolder,
  dissolveFolder,
  FOLDER_COLORS,
  moveFolderBy,
  openTabInFolder,
  recolorFolder,
} from "./folder-actions.ts";
import { startFolderEdit } from "./folder-editing.ts";
import { setSidebarMenuOpen } from "./sidebar-visibility.ts";
import type { BrowserTabGroup, TabState } from "./types.ts";

const MENU_ID = "neoworks-sidebar-folder-menu";

const [menuFolder, setMenuFolder] = createSignal<BrowserTabGroup | null>(null);

export function openFolderContextMenu(event: MouseEvent, group: BrowserTabGroup): void {
  setMenuFolder(group);
  openContextMenuAt(MENU_ID, event);
}

function withMenuFolder(action: (group: BrowserTabGroup) => void): () => void {
  return () => {
    const group = menuFolder();
    if (group) {
      action(group);
    }
  };
}

function colorLabel(color: string): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

function isMenuFolderColor(tabState: TabState, color: string): boolean {
  tabState.revision();
  return menuFolder()?.color === color;
}

function closeTabsLabel(tabState: TabState): string {
  tabState.revision();
  const group = menuFolder();
  if (!group) {
    return "Close folder and its tabs";
  }
  if (group.tabs.length === 1) {
    return "Close folder and its tab";
  }
  return `Close folder and its ${group.tabs.length} tabs`;
}

function ColorSubmenu(props: { tabState: TabState }) {
  return (
    <xul:menu label="Color">
      <xul:menupopup>
        <For each={FOLDER_COLORS}>
          {(color) => (
            <xul:menuitem
              type="checkbox"
              label={colorLabel(color)}
              checked={isMenuFolderColor(props.tabState, color)}
              onCommand={withMenuFolder((group) => recolorFolder(group, color))}
            />
          )}
        </For>
      </xul:menupopup>
    </xul:menu>
  );
}

export function FolderContextMenu(props: { tabState: TabState }) {
  return (
    <xul:menupopup
      id={MENU_ID}
      onPopupShowing={(event: Event) => {
        if (event.target === event.currentTarget) {
          setSidebarMenuOpen(MENU_ID, true);
        }
      }}
      onPopupHiding={(event: Event) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        setMenuFolder(null);
        setSidebarMenuOpen(MENU_ID, false);
      }}
    >
      <xul:menuitem label="Rename folder" onCommand={withMenuFolder(startFolderEdit)} />
      <ColorSubmenu tabState={props.tabState} />
      <xul:menuitem label="New tab in folder" onCommand={withMenuFolder(openTabInFolder)} />
      <xul:menuseparator />
      <xul:menuitem
        label="Move folder up"
        onCommand={withMenuFolder((group) => moveFolderBy(group, -1))}
      />
      <xul:menuitem
        label="Move folder down"
        onCommand={withMenuFolder((group) => moveFolderBy(group, 1))}
      />
      <xul:menuseparator />
      <xul:menuitem label="Delete folder, keep tabs" onCommand={withMenuFolder(dissolveFolder)} />
      <xul:menuitem label={closeTabsLabel(props.tabState)} onCommand={withMenuFolder(closeFolder)} />
    </xul:menupopup>
  );
}
