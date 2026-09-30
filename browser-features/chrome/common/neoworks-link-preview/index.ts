// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { watchLinkPreviews } from "./link-preview.ts";
import { mountLinkPreview } from "./mount.tsx";

@noraComponent(import.meta.hot)
export default class NeoworksLinkPreview extends NoraComponentBase {
  init(): void {
    const browserBox = document.getElementById("browser");
    if (!browserBox) {
      console.error("[neoworks-link-preview] #browser is unavailable at init.");
      return;
    }
    mountLinkPreview(browserBox);
    const stopWatching = watchLinkPreviews();
    onCleanup(stopWatching);
  }
}
