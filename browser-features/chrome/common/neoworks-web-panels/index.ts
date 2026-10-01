// SPDX-License-Identifier: MPL-2.0

// Web panels (#50): pinned sites (chat, notes, music) that open in a narrow
// pane next to the sidebar and keep their state while hidden. The icons sit
// in the sidebar (panel-bar.tsx); "Pin as panel" is in the page actions menu
// and the spotlight.

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { registerCommands } from "../neoworks-commands/registry.ts";
import { pinCurrentPage } from "./actions.ts";
import { mountWebPanelMenu, mountWebPanelPane } from "./mount.tsx";
import { removeAllPanelBrowsers } from "./panel-browsers.ts";
import { clearPaneLayout } from "./pane.tsx";
import { showPanel, toggleLastPanel, watchPanels } from "./store.ts";
import webPanelStyle from "./web-panels.css?inline";

@noraComponent(import.meta.hot)
export default class NeoworksWebPanels extends NoraComponentBase {
  init(): void {
    const browserBox = document.getElementById("browser");
    const popupSet = document.getElementById("mainPopupSet");
    if (!browserBox || !popupSet) {
      console.error("[neoworks-web-panels] Browser chrome is unavailable at init.");
      return;
    }

    const style = document.createElement("style");
    style.id = "neoworks-web-panels-style";
    style.textContent = webPanelStyle;
    document.head.append(style);
    onCleanup(() => style.remove());

    onCleanup(watchPanels());
    mountWebPanelPane(browserBox);
    mountWebPanelMenu(popupSet);
    onCleanup(registerCommands([
      { id: "web-panel:pin", listed: true, run: pinCurrentPage },
      { id: "web-panel:toggle", listed: true, run: toggleLastPanel },
    ]));
    onCleanup(() => {
      showPanel(null);
      removeAllPanelBrowsers();
      clearPaneLayout();
    });
  }
}
