// SPDX-License-Identifier: MPL-2.0

import { createSignal, For, Show } from "solid-js";
import { type Container, containers, NO_CONTAINER } from "./containers.ts";
import {
  closeTab,
  createGroupFromTab,
  moveTabToContainer,
  togglePinned,
} from "./tab-actions.ts";
import { setSidebarMenuOpen } from "./sidebar-visibility.ts";
import { tabbrowser } from "./tabbrowser.ts";
import type { BrowserTab, TabState } from "./types.ts";

const MENU_ID = "neoworks-sidebar-tab-menu";

const [menuTab, setMenuTab] = createSignal<BrowserTab | null>(null);

interface XULPopup extends XULElement {
  openPopupAtScreen(
    screenX: number,
    screenY: number,
    isContextMenu: boolean,
    triggerEvent: Event,
  ): void;
}

export function openTabContextMenu(event: MouseEvent, tab: BrowserTab): void {
  event.preventDefault();
  const popup = document.getElementById(MENU_ID) as XULPopup | null;
  if (!popup) {
    return;
  }
  setMenuTab(tab);
  popup.openPopupAtScreen(event.screenX, event.screenY, true, event);
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

function muteLabel(tabState: TabState): string {
  tabState.revision();
  if (menuTab()?.muted) {
    return "Unmute tab";
  }
  return "Mute tab";
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
      <xul:menuitem
        label={muteLabel(props.tabState)}
        onCommand={withMenuTab((tab) => tab.toggleMuteAudio())}
      />
      <Show when={!menuTab()?.pinned}>
        <xul:menuitem
          label="Move to new folder"
          onCommand={withMenuTab(createGroupFromTab)}
        />
      </Show>
      <ContainerSubmenu />
      <xul:menuitem
        label="Move to new window"
        onCommand={withMenuTab((tab) => tabbrowser().replaceTabWithWindow(tab))}
      />
      <xul:menuseparator />
      <xul:menuitem label="Close tab" onCommand={withMenuTab(closeTab)} />
    </xul:menupopup>
  );
}
