// SPDX-License-Identifier: MPL-2.0

// "Sidebar and window": the prefs behind neoworks-sidebar/sidebar-docking.ts,
// neoworks-toolbar/window-transparency.ts and neoworks-toolbar/glass-tint.ts.
// Open browser windows observe these prefs and update right away.

import type { PreferencesWindow, SettingGroupConfig } from "./types.ts";

const DOCKED_PREF = "neoworks.sidebar.docked";
const TRANSPARENT_PREF = "neoworks.window.transparent";
const GLASS_TINT_PREF = "neoworks.glass.tint";
const DEFAULT_GLASS_TINT = "medium";

export const SIDEBAR_WINDOW_GROUP_ID = "kitSidebarWindow";

// Unset prefs arrive as undefined; fall back to what the browser uses.
function booleanOr(fallback: boolean): (prefValue: unknown) => boolean {
  return (prefValue) => {
    if (typeof prefValue !== "boolean") {
      return fallback;
    }
    return prefValue;
  };
}

function glassTintOrDefault(prefValue: unknown): string {
  if (typeof prefValue !== "string" || prefValue === "") {
    return DEFAULT_GLASS_TINT;
  }
  return prefValue;
}

const GROUP: SettingGroupConfig = {
  controlAttrs: {
    label: "Sidebar and window",
    description: "Changes apply to open windows right away.",
  },
  headingLevel: 2,
  items: [
    {
      id: "kitSidebarDocked",
      control: "moz-toggle",
      controlAttrs: {
        label: "Dock the sidebar",
        description: "Keep the tab sidebar beside the page instead of sliding it in over the page.",
      },
    },
    {
      id: "kitWindowTransparent",
      control: "moz-toggle",
      controlAttrs: {
        label: "Transparent window",
        description: "Let the desktop show through the window frame. Blur depends on your compositor.",
      },
    },
    {
      id: "kitGlassTint",
      control: "moz-select",
      controlAttrs: {
        label: "Glass tint",
        description: "How strongly the sidebar, spotlight and menus are tinted over the page.",
      },
      options: [
        { value: "light", controlAttrs: { label: "Light" } },
        { value: "medium", controlAttrs: { label: "Medium" } },
        { value: "strong", controlAttrs: { label: "Strong" } },
      ],
    },
  ],
};

export function registerSidebarWindowGroup(win: PreferencesWindow): void {
  win.Preferences.addAll([
    { id: DOCKED_PREF, type: "bool" },
    { id: TRANSPARENT_PREF, type: "bool" },
    { id: GLASS_TINT_PREF, type: "string" },
  ]);
  win.Preferences.addSetting({ id: "kitSidebarDocked", pref: DOCKED_PREF, get: booleanOr(true) });
  win.Preferences.addSetting({
    id: "kitWindowTransparent",
    pref: TRANSPARENT_PREF,
    get: booleanOr(false),
  });
  win.Preferences.addSetting({ id: "kitGlassTint", pref: GLASS_TINT_PREF, get: glassTintOrDefault });
  win.SettingGroupManager.registerGroups({ [SIDEBAR_WINDOW_GROUP_ID]: GROUP });
}
