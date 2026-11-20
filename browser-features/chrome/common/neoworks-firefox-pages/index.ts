// SPDX-License-Identifier: MPL-2.0

// Buttons, links and accents on Firefox's own pages in Kit's style
// (pages.css), through one user sheet shared by all windows.

import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import pagesStyle from "./pages.css?raw";
import type { PageStylesModule } from "./types.ts";

@noraComponent(import.meta.hot)
export default class NeoworksFirefoxPages extends NoraComponentBase {
  init(): void {
    try {
      const { setPageStyle } = ChromeUtils.importESModule(
        "resource://noraneko/modules/NWPageStyles.sys.mjs",
      ) as PageStylesModule;
      setPageStyle(pagesStyle);
    } catch (error) {
      console.error(
        "[neoworks-firefox-pages] Styling Firefox's pages is unavailable:",
        error,
      );
    }
  }
}
