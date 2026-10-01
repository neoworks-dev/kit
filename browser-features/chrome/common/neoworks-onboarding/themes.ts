// SPDX-License-Identifier: MPL-2.0

// Firefox's built-in themes, which Kit's colors follow (neoworks-ui/glass.css).
// Picking one enables it like about:addons does, so the choice sticks and
// shows up there.

import { createSignal } from "solid-js";
import type { ThemeChoice } from "./types.ts";

interface ThemeAddon {
  id: string;
  isActive: boolean;
  enable(): Promise<void>;
}

const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs",
) as {
  AddonManager: {
    getAddonByID(id: string): Promise<ThemeAddon | null>;
    getAddonsByTypes(types: string[]): Promise<ThemeAddon[]>;
  };
};

export const THEME_CHOICES: ThemeChoice[] = [
  {
    id: "default-theme@mozilla.org",
    label: "System",
    description: "Light or dark, like your desktop",
    schemes: ["light", "dark"],
  },
  {
    id: "firefox-compact-light@mozilla.org",
    label: "Light",
    description: "Always light",
    schemes: ["light"],
  },
  {
    id: "firefox-compact-dark@mozilla.org",
    label: "Dark",
    description: "Always dark",
    schemes: ["dark"],
  },
];

const [activeThemeId, setActiveThemeId] = createSignal<string | null>(null);

export { activeThemeId };

export async function readActiveTheme(): Promise<void> {
  try {
    const themes = await AddonManager.getAddonsByTypes(["theme"]);
    setActiveThemeId(themes.find((theme) => theme.isActive)?.id ?? null);
  } catch (error) {
    console.error("[neoworks-onboarding] Couldn't read the active theme:", error);
  }
}

export async function applyTheme(id: string): Promise<void> {
  setActiveThemeId(id);
  try {
    const theme = await AddonManager.getAddonByID(id);
    await theme?.enable();
  } catch (error) {
    console.error("[neoworks-onboarding] Couldn't switch theme:", error);
  }
  await readActiveTheme();
}
