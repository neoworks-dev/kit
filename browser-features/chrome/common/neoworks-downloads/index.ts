// SPDX-License-Identifier: MPL-2.0

import { createEffect, onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { registerCommands } from "../neoworks-commands/registry.ts";
import {
  downloadsButton,
  insertDownloadsButton,
  syncDownloadsButton,
} from "./downloads-button.ts";
import { watchDownloads } from "./download-list.ts";
import {
  closeDownloadsPanel,
  downloadsPanelOpen,
  toggleDownloadsPanel,
} from "./downloads-panel.tsx";
import { mountDownloadsPanel } from "./mount.tsx";
import { SIDEBAR_DOWNLOADS_BUTTON_ID } from "./sidebar-downloads-button.tsx";

// Firefox pops its own downloads panel open on every new download.
const FIREFOX_AUTO_OPEN_PREF = "browser.download.alwaysOpenPanel";

// The sidebar footer's button while the sidebar is docked, else the top
// bar's (hidden without downloads). Failing both, the panel hangs off the top
// bar's end.
function toggleFromCommand(): void {
  const footerButton = document.getElementById(SIDEBAR_DOWNLOADS_BUTTON_ID);
  if (footerButton && document.documentElement.hasAttribute("nw-sidebar-docked")) {
    toggleDownloadsPanel(footerButton);
    return;
  }
  const button = downloadsButton();
  if (button && !button.hasAttribute("hidden")) {
    toggleDownloadsPanel(button);
    return;
  }
  const navBar = document.getElementById("nav-bar");
  if (navBar) {
    toggleDownloadsPanel(navBar);
  }
}

@noraComponent(import.meta.hot)
export default class NeoworksDownloads extends NoraComponentBase {
  init(): void {
    if (!document.body) {
      console.error("[neoworks-downloads] Browser chrome is unavailable at init.");
      return;
    }
    Services.prefs.setBoolPref(FIREFOX_AUTO_OPEN_PREF, false);
    mountDownloadsPanel(document.body);
    onCleanup(watchDownloads(downloadsPanelOpen));
    onCleanup(insertDownloadsButton(toggleDownloadsPanel));
    createEffect(syncDownloadsButton);

    const unregister = registerCommands([
      { id: "downloads:open", listed: true, run: toggleFromCommand },
    ]);
    onCleanup(() => {
      unregister();
      closeDownloadsPanel();
    });
  }
}
