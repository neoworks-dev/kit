// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { mountSidebar, mountTabContextMenu } from "./mount.tsx";
import { createTabState } from "./tab-state.ts";
import { applyToolboxVisibility, restoreToolbox } from "./toolbox-visibility.ts";

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
    mountSidebar(browserBox, tabState);
    mountTabContextMenu(popupSet, tabState);
    applyToolboxVisibility();

    onCleanup(() => {
      tabState.dispose();
      restoreToolbox();
    });
  }
}
