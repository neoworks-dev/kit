// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { registerCommands } from "../neoworks-commands/registry.ts";
import { mountSpotlight } from "./mount.tsx";
import { openSpotlight } from "./spotlight.tsx";

@noraComponent(import.meta.hot)
export default class NeoworksSpotlight extends NoraComponentBase {
  init(): void {
    if (!document.body) {
      console.error("[neoworks-spotlight] Browser chrome is unavailable at init.");
      return;
    }
    mountSpotlight(document.body);

    const unregister = registerCommands([
      { id: "spotlight:open", listed: false, run: openSpotlight },
    ]);
    onCleanup(unregister);
  }
}
