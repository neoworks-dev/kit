// SPDX-License-Identifier: MPL-2.0

// The active Firefox theme's new tab colors (ntp_background, ntp_text,
// ntp_card_background), from the NRStartPage actor. Without them the page
// follows light and dark through prefers-color-scheme (globals.css).

import type { NewTabTheme } from "./types.ts";

declare global {
  var NRGetTheme: (() => string) | undefined;
}

const VARIABLES: Record<keyof NewTabTheme, string> = {
  background: "--theme-background",
  text: "--theme-text",
  card: "--theme-card",
};

function readTheme(): NewTabTheme | null {
  if (!globalThis.NRGetTheme) {
    return null;
  }
  try {
    return JSON.parse(globalThis.NRGetTheme()) as NewTabTheme;
  } catch (e) {
    console.error("[NewTab] Failed to read the theme:", e);
    return null;
  }
}

// Light text means a dark page; the threshold is Firefox's contentTheme.js.
function isLight(color: string): boolean {
  const [r, g, b] = color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  return 0.2125 * r + 0.7154 * g + 0.0721 * b > 110;
}

function applyTheme(): void {
  const theme = readTheme();
  const root = document.documentElement;
  for (const [key, variable] of Object.entries(VARIABLES)) {
    const color = theme?.[key as keyof NewTabTheme];
    if (color) {
      root.style.setProperty(variable, color);
    } else {
      root.style.removeProperty(variable);
    }
  }
  if (theme?.text) {
    root.dataset.themeScheme = isLight(theme.text) ? "dark" : "light";
  } else {
    delete root.dataset.themeScheme;
  }
}

export function followTheme(): void {
  applyTheme();
  globalThis.addEventListener("NRThemeChanged", applyTheme);
}
