// SPDX-License-Identifier: MPL-2.0

import { createSignal, For, Show } from "solid-js";
import { type Container, containers, NO_CONTAINER } from "./containers.ts";
import {
  createFolder,
  DEFAULT_FOLDER_LABEL,
  moveTabIntoFolder,
  removeTabFromFolder,
  visibleFolders,
} from "./folder-actions.ts";
import {
  addToEssentials,
  essentialTabs,
  isEssential,
  MAX_ESSENTIALS,
  removeFromEssentials,
} from "./essentials.ts";
import { startFolderEdit } from "./folder-editing.ts";
import {
  closeTab,
  isUnloaded,
  moveTabToContainer,
  togglePinned,
  unloadOtherTabs,
  unloadTabs,
} from "./tab-actions.ts";
import { setSidebarMenuOpen } from "./sidebar-visibility.ts";
import { removeFromSplit } from "../neoworks-split/split-view.ts";
import type { SplitTab } from "../neoworks-split/types.ts";
import { tabbrowser } from "./tabbrowser.ts";
import type { BrowserTab, BrowserTabGroup, TabState, Workspace } from "./types.ts";
import { activeWorkspaceId, moveTabToWorkspace, workspaces } from "./workspaces.ts";

const MENU_ID = "neoworks-sidebar-tab-menu";

const [menuTab, setMenuTab] = createSignal<BrowserTab | null>(null);

interface XULPopup extends XULElement {
  openPopupAtScreen(
    screenX: number,
    screenY: number,
    isContextMenu: boolean,
    triggerEvent: Event,
  ): void;
  openPopup(anchor: Element, position: string): void;
}

// Keyboard-opened context menus carry no pointer position; anchor those to
// the row instead.
export function openContextMenuAt(menuId: string, event: MouseEvent): void {
  event.preventDefault();
  const popup = document.getElementById(menuId) as XULPopup | null;
  if (!popup) {
    return;
  }
  if (event.screenX === 0 && event.screenY === 0) {
    popup.openPopup(event.currentTarget as Element, "after_start");
    return;
  }
  popup.openPopupAtScreen(event.screenX, event.screenY, true, event);
}

export function openTabContextMenu(event: MouseEvent, tab: BrowserTab): void {
  setMenuTab(tab);
  openContextMenuAt(MENU_ID, event);
}

function withMenuTab(action: (tab: BrowserTab) => void): () => void {
  return () => {
    const tab = menuTab();
    if (tab) {
      action(tab);
    }
  };
}

function pinLabel(tabState: TabState): string {
  tabState.revision();
  if (menuTab()?.pinned) {
    return "Unpin tab";
  }
  return "Pin tab";
}

function EssentialsMenuItem(props: { tabState: TabState }) {
  const essential = () => {
    props.tabState.revision();
    const tab = menuTab();
    return !!tab && isEssential(tab);
  };
  const full = () => {
    props.tabState.revision();
    return essentialTabs().length >= MAX_ESSENTIALS;
  };
  return (
    <Show
      when={essential()}
      fallback={
        <xul:menuitem
          label="Add to Essentials"
          disabled={full() || undefined}
          onCommand={withMenuTab((tab) => addToEssentials(tab))}
        />
      }
    >
      <xul:menuitem
        label="Remove from Essentials"
        onCommand={withMenuTab(removeFromEssentials)}
      />
    </Show>
  );
}

function muteLabel(tabState: TabState): string {
  tabState.revision();
  if (menuTab()?.muted) {
    return "Unmute tab";
  }
  return "Mute tab";
}

function menuTabUnloaded(tabState: TabState): boolean {
  tabState.revision();
  const tab = menuTab();
  return !tab || isUnloaded(tab);
}

function isMenuTabContainer(userContextId: number): boolean {
  return menuTab()?.userContextId === userContextId;
}

function ContainerMenuItem(props: { label: string; userContextId: number }) {
  return (
    <xul:menuitem
      type="checkbox"
      label={props.label}
      checked={isMenuTabContainer(props.userContextId)}
      onCommand={withMenuTab((tab) => moveTabToContainer(tab, props.userContextId))}
    />
  );
}

function ContainerSubmenu() {
  return (
    <xul:menu label="Move to container">
      <xul:menupopup>
        <ContainerMenuItem label="No container" userContextId={NO_CONTAINER} />
        <xul:menuseparator />
        <For each={containers()}>
          {(container: Container) => (
            <ContainerMenuItem label={container.name} userContextId={container.userContextId} />
          )}
        </For>
      </xul:menupopup>
    </xul:menu>
  );
}

// Essentials are in every workspace already.
function WorkspaceSubmenu(props: { tabState: TabState }) {
  const otherWorkspaces = (): Workspace[] =>
    workspaces().filter((workspace) => workspace.id !== activeWorkspaceId());
  const movable = () => {
    props.tabState.revision();
    const tab = menuTab();
    return !!tab && !isEssential(tab) && otherWorkspaces().length > 0;
  };
  return (
    <Show when={movable()}>
      <xul:menu label="Move to workspace">
        <xul:menupopup>
          <For each={otherWorkspaces()}>
            {(workspace: Workspace) => (
              <xul:menuitem
                label={workspace.name}
                onCommand={withMenuTab((tab) => moveTabToWorkspace(tab, workspace.id))}
              />
            )}
          </For>
        </xul:menupopup>
      </xul:menu>
    </Show>
  );
}

function moveTabToNewFolder(tab: BrowserTab): void {
  startFolderEdit(createFolder(tab));
}

function FolderSubmenu(props: { tabState: TabState }) {
  const otherFolders = (): BrowserTabGroup[] => {
    props.tabState.revision();
    const currentFolder = menuTab()?.group;
    return visibleFolders().filter((group) => group !== currentFolder);
  };

  return (
    <xul:menu label="Move to folder">
      <xul:menupopup>
        <xul:menuitem label="New folder" onCommand={withMenuTab(moveTabToNewFolder)} />
        <Show when={otherFolders().length > 0}>
          <xul:menuseparator />
        </Show>
        <For each={otherFolders()}>
          {(group: BrowserTabGroup) => (
            <xul:menuitem
              label={group.label || DEFAULT_FOLDER_LABEL}
              onCommand={withMenuTab((tab) => moveTabIntoFolder(tab, group))}
            />
          )}
        </For>
      </xul:menupopup>
    </xul:menu>
  );
}

// Native XUL popup: gets Firefox's menu keyboard navigation, positioning and
// platform styling for free.
export function TabContextMenu(props: { tabState: TabState }) {
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
        setMenuTab(null);
        setSidebarMenuOpen(MENU_ID, false);
      }}
    >
      <xul:menuitem
        label="Reload tab"
        onCommand={withMenuTab((tab) => tabbrowser().reloadTab(tab))}
      />
      <xul:menuitem
        label="Duplicate tab"
        onCommand={withMenuTab((tab) => tabbrowser().duplicateTab(tab))}
      />
      <xul:menuitem
        label={pinLabel(props.tabState)}
        onCommand={withMenuTab(togglePinned)}
      />
      <EssentialsMenuItem tabState={props.tabState} />
      <xul:menuitem
        label={muteLabel(props.tabState)}
        onCommand={withMenuTab((tab) => tab.toggleMuteAudio())}
      />
      <xul:menuitem
        label="Unload tab"
        disabled={menuTabUnloaded(props.tabState) || undefined}
        onCommand={withMenuTab((tab) => unloadTabs([tab]))}
      />
      <xul:menuitem label="Unload other tabs" onCommand={withMenuTab(unloadOtherTabs)} />
      <Show when={!menuTab()?.pinned}>
        <FolderSubmenu tabState={props.tabState} />
      </Show>
      <Show when={menuTab()?.splitview}>
        <xul:menuitem
          label="Remove from split"
          onCommand={withMenuTab((tab) => removeFromSplit(tab as SplitTab))}
        />
      </Show>
      <Show when={menuTab()?.group}>
        <xul:menuitem
          label="Remove from folder"
          onCommand={withMenuTab(removeTabFromFolder)}
        />
      </Show>
      <WorkspaceSubmenu tabState={props.tabState} />
      <ContainerSubmenu />
      <xul:menuitem
        label="Move to new window"
        onCommand={withMenuTab((tab) => tabbrowser().replaceTabWithWindow(tab))}
      />
      <xul:menuseparator />
      <xul:menuitem
        label="Close tab"
        class="nw-menu-danger"
        onCommand={withMenuTab(closeTab)}
      />
    </xul:menupopup>
  );
}
