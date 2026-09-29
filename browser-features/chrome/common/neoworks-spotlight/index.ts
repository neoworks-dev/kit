// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { listenForChromeDoubleSpace } from "./double-space.ts";
import { mountSpotlight } from "./mount.tsx";
import { openSpotlight } from "./spotlight.tsx";

// Dispatched by NWSpotlightParent when a double Space happens in web content.
const OPEN_SPOTLIGHT_EVENT = "NeoworksOpenSpotlight";

@noraComponent(import.meta.hot)
export default class NeoworksSpotlight extends NoraComponentBase {
  init(): void {
    if (!document.body) {
      console.error("[neoworks-spotlight] Browser chrome is unavailable at init.");
      return;
    }
    mountSpotlight(document.body);

    addEventListener(OPEN_SPOTLIGHT_EVENT, openSpotlight);
    const stopChromeListener = listenForChromeDoubleSpace(openSpotlight);

    onCleanup(() => {
      removeEventListener(OPEN_SPOTLIGHT_EVENT, openSpotlight);
      stopChromeListener();
    });
  }
}
