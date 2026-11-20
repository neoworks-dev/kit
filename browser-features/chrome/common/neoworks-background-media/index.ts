// SPDX-License-Identifier: MPL-2.0

// Suspends media in background tabs that keep decoding video
// (NWBackgroundMedia.sys.mts). The watch covers all windows; the first window
// starts it.

import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";

interface BackgroundMediaModule {
  watchBackgroundMedia(): void;
}

@noraComponent(import.meta.hot)
export default class NeoworksBackgroundMedia extends NoraComponentBase {
  init(): void {
    try {
      const module = ChromeUtils.importESModule(
        "resource://noraneko/modules/NWBackgroundMedia.sys.mjs",
      ) as BackgroundMediaModule;
      module.watchBackgroundMedia();
    } catch (error) {
      console.error("[neoworks-background-media] Can't watch background media:", error);
    }
  }
}
