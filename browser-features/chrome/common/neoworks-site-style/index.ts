// SPDX-License-Identifier: MPL-2.0

// Per-site styling (#49). Custom CSS and dark mode reach pages through the
// NWSiteStyle actor; the default zoom hooks into Firefox's FullZoom here. The
// controls live in the page actions menu (site-section.tsx).

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { loadSiteSettings, watchSiteSettings } from "./site-settings.ts";
import { patchFullZoom, reapplySiteZoom } from "./zoom.ts";

@noraComponent(import.meta.hot)
export default class NeoworksSiteStyle extends NoraComponentBase {
  init(): void {
    try {
      onCleanup(patchFullZoom());
    } catch (error) {
      console.error("[neoworks-site-style] Default zoom is unavailable:", error);
    }
    onCleanup(watchSiteSettings(reapplySiteZoom));
    loadSiteSettings().catch((error: unknown) => {
      console.error("[neoworks-site-style] Loading the site settings failed:", error);
    });
  }
}
