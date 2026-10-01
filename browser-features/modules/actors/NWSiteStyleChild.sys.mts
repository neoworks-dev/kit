/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Gives a top-level page its site's custom CSS and forced dark mode as author
// sheets. Unlike the style service's user sheets, they cascade after the
// page's own sheets, so plain rules win at equal specificity. They follow
// changes made while the page is open.
//
// Dark mode inverts the page, so it only applies to pages that render light:
// a site with its own dark theme (prefers-color-scheme) is left as it is.
// That is decided once the page's styles are in, at DOMContentLoaded.

import {
  colorLuminance,
  DARK_MODE_CSS,
  NW_SITE_STYLES_KEY,
  type NWSiteStyle,
  type NWSiteStyles,
  siteOf,
} from "../common/NWSiteSettings.ts";

interface SharedDataChangeEvent extends Event {
  changedKeys: string[];
}

// The generated XPCOM types mark interface constants as optional.
const AUTHOR_SHEET = Ci.nsIDOMWindowUtils.AUTHOR_SHEET ?? 2;
const LIGHT_LUMINANCE = 0.4;

function sheetUri(css: string): string {
  return `data:text/css;charset=utf-8,${encodeURIComponent(css)}`;
}

const DARK_SHEET_URI = sheetUri(DARK_MODE_CSS);

export class NWSiteStyleChild extends JSWindowActorChild {
  #cssUri: string | null = null;
  #loaded = false;
  #darkWanted = false;
  #darkApplied = false;

  #onSharedDataChange = (event: Event): void => {
    if ((event as SharedDataChangeEvent).changedKeys.includes(NW_SITE_STYLES_KEY)) {
      this.#apply();
    }
  };

  actorCreated(): void {
    Services.cpmm.sharedData?.addEventListener("change", this.#onSharedDataChange);
  }

  didDestroy(): void {
    Services.cpmm.sharedData?.removeEventListener("change", this.#onSharedDataChange);
  }

  // DOMDocElementInserted (before the first paint) and DOMContentLoaded.
  handleEvent(event: Event): void {
    if (event.type === "DOMContentLoaded") {
      this.#loaded = true;
    }
    this.#apply();
  }

  #siteStyle(): NWSiteStyle | undefined {
    const site = siteOf(this.document?.documentURIObject);
    if (!site) {
      return undefined;
    }
    const styles = Services.cpmm.sharedData?.get(NW_SITE_STYLES_KEY) as NWSiteStyles | undefined;
    return styles?.[site];
  }

  #apply(): void {
    const style = this.#siteStyle();
    try {
      this.#applyCss(style?.css?.trim() ? sheetUri(style.css) : null);
      this.#applyDarkMode(this.#loaded && style?.darkMode === true);
    } catch (error) {
      console.error("[NWSiteStyle] Couldn't apply the site's style:", error);
    }
  }

  #applyCss(uri: string | null): void {
    if (uri === this.#cssUri) {
      return;
    }
    const windowUtils = this.contentWindow?.windowUtils;
    if (!windowUtils) {
      return;
    }
    if (this.#cssUri) {
      windowUtils.removeSheetUsingURIString(this.#cssUri, AUTHOR_SHEET);
    }
    if (uri) {
      windowUtils.loadSheetUsingURIString(uri, AUTHOR_SHEET);
    }
    this.#cssUri = uri;
  }

  #applyDarkMode(wanted: boolean): void {
    if (wanted === this.#darkWanted) {
      return;
    }
    const windowUtils = this.contentWindow?.windowUtils;
    if (!windowUtils) {
      return;
    }
    this.#darkWanted = wanted;
    if (this.#darkApplied) {
      windowUtils.removeSheetUsingURIString(DARK_SHEET_URI, AUTHOR_SHEET);
      this.#darkApplied = false;
    }
    if (wanted && this.#rendersLight()) {
      windowUtils.loadSheetUsingURIString(DARK_SHEET_URI, AUTHOR_SHEET);
      this.#darkApplied = true;
    }
  }

  // The body's or root's background, else the canvas, which follows the
  // page's color-scheme.
  #rendersLight(): boolean {
    const window = this.contentWindow;
    const document = this.document;
    if (!window || !document?.documentElement) {
      return false;
    }
    for (const element of [document.body, document.documentElement]) {
      if (!element) {
        continue;
      }
      const luminance = colorLuminance(window.getComputedStyle(element)?.backgroundColor ?? "");
      if (luminance !== null) {
        return luminance > LIGHT_LUMINANCE;
      }
    }
    const scheme = window.getComputedStyle(document.documentElement)?.colorScheme ?? "";
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)")?.matches === true;
    return !(prefersDark && scheme.includes("dark"));
  }
}
