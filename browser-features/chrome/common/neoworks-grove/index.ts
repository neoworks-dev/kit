// SPDX-License-Identifier: MPL-2.0

// Grove's coding agents in Kit tabs (#81): the window's side of
// NWGrove.sys.mts. It follows the developer setting, opens tabs for Grove in
// a workspace per worktree, and marks the tabs Grove's agents can drive. The
// tab menu's entries are in tab-menu.tsx. Off in private windows.

import { onCleanup } from "solid-js";
import { noraComponent, NoraComponentBase } from "#features-chrome/utils/base.ts";
import { groveModule, watchGrove } from "./grove.ts";
import { mountGroveIndicator } from "./mount.tsx";
import { openWorktreeTab } from "./worktree-workspace.ts";

const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
) as { PrivateBrowsingUtils: { isWindowPrivate(window: Window): boolean } };

@noraComponent(import.meta.hot)
export default class NeoworksGrove extends NoraComponentBase {
  init(): void {
    if (PrivateBrowsingUtils.isWindowPrivate(window)) {
      return;
    }
    const browserBox = document.getElementById("browser");
    if (!browserBox) {
      console.error("[neoworks-grove] #browser is unavailable at init.");
      return;
    }
    onCleanup(watchGrove());
    onCleanup(groveModule().registerGroveWindow(window, { openWorktreeTab }));
    mountGroveIndicator(browserBox);
  }
}
