// SPDX-License-Identifier: MPL-2.0

// Pop-up windows for links from other apps (#48). Normal windows send external
// links to a minimal window; minimal windows get a header that moves the page
// into the main window.

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { routeExternalLinks } from "./external-links.ts";
import { isMinimalWindow, setUpMinimalWindow } from "./minimal-window.ts";
import { mountLinkWindowHeader } from "./mount.tsx";
import linkWindowStyle from "./link-window.css?inline";

@noraComponent(import.meta.hot)
export default class NeoworksLinkWindow extends NoraComponentBase {
  init(): void {
    if (!isMinimalWindow()) {
      try {
        routeExternalLinks();
      } catch (error) {
        console.error("[neoworks-link-window] Can't route external links:", error);
      }
      return;
    }

    const toolbox = document.getElementById("navigator-toolbox");
    if (!toolbox) {
      console.error("[neoworks-link-window] #navigator-toolbox is unavailable at init.");
      return;
    }
    const style = document.createElement("style");
    style.id = "neoworks-link-window-style";
    style.textContent = linkWindowStyle;
    document.head.append(style);
    onCleanup(() => style.remove());
    onCleanup(setUpMinimalWindow());
    mountLinkWindowHeader(toolbox);
  }
}
