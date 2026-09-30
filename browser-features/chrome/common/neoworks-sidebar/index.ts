// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { closeContainerMenu } from "./container-bar.tsx";
import { watchContainers } from "./containers.ts";
import { stopFolderEdit } from "./folder-editing.ts";
import { mountContextMenus, mountSidebar } from "./mount.tsx";
import {
  disposeSidebarVisibility,
  peekSidebar,
  SIDEBAR_PEEK_EVENT,
} from "./sidebar-visibility.ts";
import { createTabState } from "./tab-state.ts";
import { flagWorkspaceContainer } from "./workspace-container-flag.ts";
import { toggleSidebarDocked, watchSidebarDocking } from "./sidebar-docking.ts";
import { registerCommands } from "../neoworks-commands/registry.ts";
import { closeWorkspaceMenu } from "./workspace-switcher.tsx";
import { routeNewTabsToDefaultContainer } from "./new-tab-container.ts";
import {
  switchWorkspaceBy,
  switchWorkspaceByNumber,
  watchWorkspaces,
} from "./workspaces.ts";

@noraComponent(import.meta.hot)
export default class NeoworksSidebar extends NoraComponentBase {
  init(): void {
    const browserBox = document.getElementById("browser");
    const popupSet = document.getElementById("mainPopupSet");
    if (!browserBox || !popupSet) {
      console.error("[neoworks-sidebar] Browser chrome is unavailable at init.");
      return;
    }

    const tabState = createTabState();
    const stopWatchingContainers = watchContainers();
    const stopWatchingDocking = watchSidebarDocking();
    const stopWatchingWorkspaces = watchWorkspaces();
    const stopRoutingNewTabs = routeNewTabsToDefaultContainer();
    mountSidebar(browserBox, tabState);
    flagWorkspaceContainer(tabState);
    mountContextMenus(popupSet, tabState);
    addEventListener(SIDEBAR_PEEK_EVENT, peekSidebar);
    const unregisterCommands = registerCommands([
      { id: "sidebar:toggle-docked", listed: true, run: toggleSidebarDocked },
      { id: "workspace:next", listed: true, run: () => switchWorkspaceBy(1) },
      { id: "workspace:previous", listed: true, run: () => switchWorkspaceBy(-1) },
      {
        id: "workspace:switch",
        listed: false,
        run: (invocation) => switchWorkspaceByNumber(invocation.letter),
      },
    ]);

    onCleanup(() => {
      unregisterCommands();
      stopFolderEdit();
      closeWorkspaceMenu();
      stopRoutingNewTabs();
      stopWatchingWorkspaces();
      stopWatchingDocking();
      removeEventListener(SIDEBAR_PEEK_EVENT, peekSidebar);
      closeContainerMenu();
      stopWatchingContainers();
      disposeSidebarVisibility();
      tabState.dispose();
    });
  }
}
