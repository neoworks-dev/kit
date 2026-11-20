// SPDX-License-Identifier: MPL-2.0

// "Sidebar and window": the prefs behind neoworks-sidebar/sidebar-state.ts,
// neoworks-sidebar/tab-archive.ts, neoworks-sidebar/essentials.ts, neoworks-toolbar/window-transparency.ts,
// neoworks-toolbar/window-controls.ts, neoworks-toolbar/glass-tint.ts,
// neoworks-link-window/external-links.ts and NWWindowSync.sys.mts.
// Open browser windows observe these prefs and update right away.

import type { PreferencesWindow, SettingGroupConfig } from "./types.ts";

// Same prefs, values and defaults as neoworks-sidebar/sidebar-state-model.ts.
const SIDEBAR_STATE_PREF = "neoworks.sidebar.state";
const DEFAULT_SIDEBAR_STATE = "expanded";
const SIDEBAR_TOGGLE_PREF = "neoworks.sidebar.toggle";
const DEFAULT_SIDEBAR_TOGGLE = "expanded-hidden";
const TRANSPARENT_PREF = "neoworks.window.transparent";
const ALL_CONTROLS_PREF = "neoworks.window.allControls";
const GLASS_TINT_PREF = "neoworks.glass.tint";
const EXTERNAL_POPUP_PREF = "neoworks.links.externalPopup";
// Same pref and default as NWWindowSync.sys.mts.
const WINDOW_SYNC_PREF = "neoworks.windows.sync";
const DEFAULT_GLASS_TINT = "medium";
// Hours; 0 is never. Same default as neoworks-sidebar/tab-archive.ts.
const ARCHIVE_AFTER_PREF = "neoworks.tabs.archiveAfterHours";
const DEFAULT_ARCHIVE_AFTER_HOURS = 168;
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

function sidebarStateOrDefault(prefValue: unknown): string {
  if (prefValue === "hidden" || prefValue === "compact") {
    return prefValue;
  }
  return DEFAULT_SIDEBAR_STATE;
}

function sidebarToggleOrDefault(prefValue: unknown): string {
  if (prefValue === "expanded-compact" || prefValue === "compact-hidden") {
    return prefValue;
  }
  return DEFAULT_SIDEBAR_TOGGLE;
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
      id: "kitSidebarState",
      control: "moz-select",
      controlAttrs: {
        label: "Sidebar",
        description:
          "Hidden, the sidebar slides in over the page when the pointer reaches the window's left edge.",
      },
      options: [
        { value: "expanded", controlAttrs: { label: "Expanded" } },
        { value: "compact", controlAttrs: { label: "Icons only" } },
        { value: "hidden", controlAttrs: { label: "Hidden" } },
      ],
    },
    {
      id: "kitSidebarToggle",
      control: "moz-select",
      controlAttrs: {
        label: "Sidebar shortcut switches between",
        description:
          "Alt+C, or Toggle Sidebar in the spotlight. From the third state it goes to the first of the two.",
      },
      options: [
        {
          value: "expanded-hidden",
          controlAttrs: { label: "Expanded and hidden" },
        },
        {
          value: "expanded-compact",
          controlAttrs: { label: "Expanded and icons only" },
        },
        {
          value: "compact-hidden",
          controlAttrs: { label: "Icons only and hidden" },
        },
      ],
    },
    {
      id: "kitEssentialsScope",
      control: "moz-select",
      controlAttrs: {
        label: "Essentials",
        description:
          "Which workspaces show each Essential. Switching moves no tabs. A set can hold nine.",
      },
      options: [
        {
          value: "shared",
          controlAttrs: { label: "Shared by all workspaces" },
        },
        { value: "workspace", controlAttrs: { label: "Per workspace" } },
        { value: "container", controlAttrs: { label: "Per container" } },
      ],
    },
    {
      id: "kitArchiveAfter",
      control: "moz-select",
      controlAttrs: {
        label: "Archive unused tabs",
        description:
          "Close tabs you haven't used for a while. Find them again in the spotlight. Pinned tabs and Essentials are never archived.",
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
      id: "kitWindowSync",
      control: "moz-toggle",
      controlAttrs: {
        label: "Same tabs in every window",
        description:
          "Every window shows the same tabs, folders and Essentials. A page moves to the window you use.",
      },
    },
    {
      id: "kitWindowTransparent",
      control: "moz-toggle",
      controlAttrs: {
        label: "Transparent window",
        description:
          "Let the desktop show through the window frame. Blur depends on your compositor.",
      },
    },
    {
      id: "kitWindowAllControls",
      control: "moz-toggle",
      controlAttrs: {
        label: "Show all window controls",
        description:
          "Show minimize and maximize even when your desktop's button layout only lists close.",
      },
    },
    {
      id: "kitExternalPopup",
      control: "moz-toggle",
      controlAttrs: {
        label: "Open links from other apps in a small window",
        description:
          "Instead of a new tab. Move the page into a tab with Open in Kit (Ctrl+Enter), or just close the window.",
      },
    },
    {
      id: "kitGlassTint",
      control: "moz-select",
      controlAttrs: {
        label: "Glass tint",
        description:
          "How strongly the sidebar, spotlight and menus are tinted over the page.",
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
    { id: SIDEBAR_STATE_PREF, type: "string" },
    { id: SIDEBAR_TOGGLE_PREF, type: "string" },
    { id: TRANSPARENT_PREF, type: "bool" },
    { id: ALL_CONTROLS_PREF, type: "bool" },
    { id: GLASS_TINT_PREF, type: "string" },
    { id: EXTERNAL_POPUP_PREF, type: "bool" },
    { id: WINDOW_SYNC_PREF, type: "bool" },
    { id: ARCHIVE_AFTER_PREF, type: "int" },
    { id: ESSENTIALS_SCOPE_PREF, type: "string" },
  ]);
  win.Preferences.addSetting({
    id: "kitSidebarState",
    pref: SIDEBAR_STATE_PREF,
    get: sidebarStateOrDefault,
  });
  win.Preferences.addSetting({
    id: "kitSidebarToggle",
    pref: SIDEBAR_TOGGLE_PREF,
    get: sidebarToggleOrDefault,
  });
  win.Preferences.addSetting({
    id: "kitWindowSync",
    pref: WINDOW_SYNC_PREF,
    get: booleanOr(true),
  });
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
  win.Preferences.addSetting({
    id: "kitGlassTint",
    pref: GLASS_TINT_PREF,
    get: glassTintOrDefault,
  });
  win.SettingGroupManager.registerGroups({ [SIDEBAR_WINDOW_GROUP_ID]: GROUP });
}
