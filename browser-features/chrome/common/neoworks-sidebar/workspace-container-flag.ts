// SPDX-License-Identifier: MPL-2.0

// Marks the root while the selected tab uses its workspace's own container,
// so the top bar can drop its container chip then (neoworks-toolbar/
// toolbar.css): the chip only says something when the tab differs.

import { createEffect, onCleanup } from "solid-js";
import { tabbrowser } from "./tabbrowser.ts";
import type { TabState } from "./types.ts";
import { activeWorkspace } from "./workspaces.ts";

const ATTRIBUTE = "nw-tab-in-workspace-container";

// Call inside a reactive root; the attribute is removed on cleanup.
export function flagWorkspaceContainer(tabState: TabState): void {
  createEffect(() => {
    tabState.revision();
    const matches = tabbrowser().selectedTab.userContextId === activeWorkspace().userContextId;
    document.documentElement.toggleAttribute(ATTRIBUTE, matches);
  });
  onCleanup(() => document.documentElement.removeAttribute(ATTRIBUTE));
}
