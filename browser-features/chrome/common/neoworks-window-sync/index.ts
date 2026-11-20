// SPDX-License-Identifier: MPL-2.0

// Window sync: every normal window shows the same tabs, and a tab's page
// moves to the window you use. The work happens in NWWindowSync.sys.mts, once
// for all windows; each window signs up here and styles the picture a page
// leaves behind in a window it moved out of.

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import windowSyncStyle from "./window-sync.css?inline";
import type { WindowSyncModule } from "./types.ts";

@noraComponent(import.meta.hot)
export default class NeoworksWindowSync extends NoraComponentBase {
  init(): void {
    let stopSyncing = () => {};
    try {
      const module = ChromeUtils.importESModule(
        "resource://noraneko/modules/NWWindowSync.sys.mjs",
      ) as WindowSyncModule;
      stopSyncing = module.syncWindow(window);
    } catch (error) {
      console.error("[neoworks-window-sync] Can't sync this window's tabs:", error);
      return;
    }
    const style = document.createElement("style");
    style.id = "neoworks-window-sync-style";
    style.textContent = windowSyncStyle;
    document.head.append(style);
    onCleanup(() => {
      style.remove();
      stopSyncing();
    });
  }
}
