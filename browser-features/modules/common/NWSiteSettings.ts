/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Per-site settings (#49): custom CSS, forced dark mode and a default zoom,
// keyed by site (eTLD+1). NWSiteSettings.sys.mjs owns them; the styling part
// reaches content processes through sharedData for the NWSiteStyle actor.

// sharedData key holding NWSiteStyles.
export const NW_SITE_STYLES_KEY = "neoworks:site-styles";

// Observer topic, notified with the changed site as data.
export const NW_SITE_SETTINGS_CHANGED_TOPIC = "neoworks-site-settings-changed";

export interface NWSiteSettings {
  css?: string;
  darkMode?: boolean;
  // A full zoom factor, 1 = 100%.
  zoom?: number;
}

export interface NWSiteStyle {
  css?: string;
  darkMode?: boolean;
}

export type NWSiteStyles = Record<string, NWSiteStyle>;

// Inverts a light page and turns media back, so pictures keep their colors.
// The root's background propagates to the canvas, which the filter doesn't
// cover, so the root gets one that inverts to black and fills the viewport.
export const DARK_MODE_CSS = `
:root {
  min-height: 100vh !important;
  background-color: #fff !important;
  filter: invert(1) hue-rotate(180deg) !important;
}
img, picture, video, canvas, iframe, embed, object, svg image,
[style*="background-image"] {
  filter: invert(1) hue-rotate(180deg) !important;
}
`;

// http(s) pages only. Hosts without a registrable domain (localhost, IP
// addresses) are their own site.
export function siteOf(uri: nsIURI | null | undefined): string | null {
  if (!uri || !(uri.schemeIs("http") || uri.schemeIs("https"))) {
    return null;
  }
  try {
    return Services.eTLD.getBaseDomain(uri);
  } catch {
    try {
      return uri.host || null;
    } catch {
      return null;
    }
  }
}

// Relative luminance of a computed color ("rgb(…)" or "rgba(…)"); null when
// it is mostly transparent.
export function colorLuminance(color: string): number | null {
  const parts = color.match(/[\d.]+/g)?.map(Number);
  if (!parts || parts.length < 3) {
    return null;
  }
  const [red, green, blue, alpha = 1] = parts;
  if (alpha < 0.5) {
    return null;
  }
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}
