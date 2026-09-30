// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { registerCommands } from "../neoworks-commands/registry.ts";
import { mountSplitOverlay } from "./mount.tsx";
import { closeSelectedPane, splitSelected, watchSplitViews } from "./split-view.ts";

@noraComponent(import.meta.hot)
export default class NeoworksSplit extends NoraComponentBase {
  init(): void {
    const browserBox = document.getElementById("browser");
    if (!browserBox) {
      console.error("[neoworks-split] #browser is unavailable at init.");
      return;
    }
    const stopWatching = watchSplitViews();
    mountSplitOverlay(browserBox);
    const unregisterCommands = registerCommands([
      { id: "split:vertical", listed: true, run: () => splitSelected("row") },
      { id: "split:horizontal", listed: true, run: () => splitSelected("column") },
      { id: "split:close", listed: true, run: closeSelectedPane },
    ]);
    onCleanup(() => {
      unregisterCommands();
      stopWatching();
    });
  }
}
