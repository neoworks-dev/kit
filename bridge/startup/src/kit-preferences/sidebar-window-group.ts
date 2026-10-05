// SPDX-License-Identifier: MPL-2.0

// "Sidebar and window": the prefs behind neoworks-sidebar/sidebar-docking.ts,
// neoworks-sidebar/tab-archive.ts, neoworks-sidebar/essentials.ts, neoworks-toolbar/window-transparency.ts,
// neoworks-toolbar/window-controls.ts, neoworks-toolbar/glass-tint.ts and
// neoworks-link-window/external-links.ts.
// Open browser windows observe these prefs and update right away.

import type { PreferencesWindow, SettingGroupConfig } from "./types.ts";

const DOCKED_PREF = "neoworks.sidebar.docked";
const TRANSPARENT_PREF = "neoworks.window.transparent";
const ALL_CONTROLS_PREF = "neoworks.window.allControls";
const GLASS_TINT_PREF = "neoworks.glass.tint";
const EXTERNAL_POPUP_PREF = "neoworks.links.externalPopup";
const DEFAULT_GLASS_TINT = "medium";
// Hours; 0 is never. Same default as neoworks-sidebar/tab-archive.ts.
const ARCHIVE_AFTER_PREF = "neoworks.tabs.archiveAfterHours";
const DEFAULT_ARCHIVE_AFTER_HOURS = 24;
// Same pref and default as neoworks-sidebar/essentials-scope.ts.
const ESSENTIALS_SCOPE_PREF = "neoworks.essentials.scope";
const DEFAULT_ESSENTIALS_SCOPE = "shared";

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

function archiveAfterOrDefault(prefValue: unknown): string {
  if (typeof prefValue !== "number") {
    return String(DEFAULT_ARCHIVE_AFTER_HOURS);
  }
  return String(prefValue);
}

function glassTintOrDefault(prefValue: unknown): string {
  if (typeof prefValue !== "string" || prefValue === "") {
    return DEFAULT_GLASS_TINT;
  }
  return prefValue;
}

function essentialsScopeOrDefault(prefValue: unknown): string {
  if (prefValue === "workspace" || prefValue === "container") {
    return prefValue;
  }
  return DEFAULT_ESSENTIALS_SCOPE;
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
      id: "kitEssentialsScope",
      control: "moz-select",
      controlAttrs: {
        label: "Essentials",
        description: "Which workspaces show each Essential. Switching moves no tabs. A set can hold nine.",
      },
      options: [
        { value: "shared", controlAttrs: { label: "Shared by all workspaces" } },
        { value: "workspace", controlAttrs: { label: "Per workspace" } },
        { value: "container", controlAttrs: { label: "Per container" } },
      ],
    },
    {
      id: "kitArchiveAfter",
      control: "moz-select",
      controlAttrs: {
        label: "Archive unused tabs",
        description: "Close tabs you haven't used for a while. Find them again in the spotlight. Pinned tabs and Essentials are never archived.",
      },
      options: [
        { value: "0", controlAttrs: { label: "Never" } },
        { value: "12", controlAttrs: { label: "After 12 hours" } },
        { value: "24", controlAttrs: { label: "After 1 day" } },
        { value: "72", controlAttrs: { label: "After 3 days" } },
        { value: "168", controlAttrs: { label: "After 7 days" } },
      ],
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
      id: "kitWindowAllControls",
      control: "moz-toggle",
      controlAttrs: {
        label: "Show all window controls",
        description: "Show minimize and maximize even when your desktop's button layout only lists close.",
      },
    },
    {
      id: "kitExternalPopup",
      control: "moz-toggle",
      controlAttrs: {
        label: "Open links from other apps in a small window",
        description: "Instead of a new tab. Move the page into a tab with Open in Kit (Ctrl+Enter), or just close the window.",
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
    { id: ALL_CONTROLS_PREF, type: "bool" },
    { id: GLASS_TINT_PREF, type: "string" },
    { id: EXTERNAL_POPUP_PREF, type: "bool" },
    { id: ARCHIVE_AFTER_PREF, type: "int" },
    { id: ESSENTIALS_SCOPE_PREF, type: "string" },
  ]);
  win.Preferences.addSetting({ id: "kitSidebarDocked", pref: DOCKED_PREF, get: booleanOr(true) });
  win.Preferences.addSetting({
    id: "kitWindowTransparent",
    pref: TRANSPARENT_PREF,
    get: booleanOr(false),
  });
  win.Preferences.addSetting({
    id: "kitWindowAllControls",
    pref: ALL_CONTROLS_PREF,
    get: booleanOr(false),
  });
  win.Preferences.addSetting({
    id: "kitArchiveAfter",
    pref: ARCHIVE_AFTER_PREF,
    get: archiveAfterOrDefault,
    set: (value) => Number(value),
  });
  win.Preferences.addSetting({
    id: "kitEssentialsScope",
    pref: ESSENTIALS_SCOPE_PREF,
    get: essentialsScopeOrDefault,
  });
  win.Preferences.addSetting({
    id: "kitExternalPopup",
    pref: EXTERNAL_POPUP_PREF,
    get: booleanOr(true),
  });
  win.Preferences.addSetting({ id: "kitGlassTint", pref: GLASS_TINT_PREF, get: glassTintOrDefault });
  win.SettingGroupManager.registerGroups({ [SIDEBAR_WINDOW_GROUP_ID]: GROUP });
}
