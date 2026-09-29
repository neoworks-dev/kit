// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { closeContainerMenu } from "./container-bar.tsx";
import { watchContainers } from "./containers.ts";
import { mountSidebar, mountTabContextMenu } from "./mount.tsx";
import {
  disposeSidebarVisibility,
  peekSidebar,
  SIDEBAR_PEEK_EVENT,
} from "./sidebar-visibility.ts";
import { createTabState } from "./tab-state.ts";
import { toggleSidebarDocked, watchSidebarDocking } from "./sidebar-docking.ts";
import { registerCommands } from "../neoworks-commands/registry.ts";
import { closeWorkspaceMenu } from "./workspace-switcher.tsx";
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
    mountSidebar(browserBox, tabState);
    mountTabContextMenu(popupSet, tabState);
    addEventListener(SIDEBAR_PEEK_EVENT, peekSidebar);
    const unregisterCommands = registerCommands([
      {
        id: "sidebar:toggle-docked",
        title: "Toggle Sidebar Docking",
        listed: true,
        run: toggleSidebarDocked,
      },
      {
        id: "workspace:next",
        title: "Next Workspace",
        listed: true,
        run: () => switchWorkspaceBy(1),
      },
      {
        id: "workspace:previous",
        title: "Previous Workspace",
        listed: true,
        run: () => switchWorkspaceBy(-1),
      },
      {
        id: "workspace:switch",
        title: "Switch Workspace",
        listed: false,
        run: (invocation) => switchWorkspaceByNumber(invocation.letter),
      },
    ]);

    onCleanup(() => {
      unregisterCommands();
      closeWorkspaceMenu();
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
