// SPDX-License-Identifier: MPL-2.0

// The settings the setup asks about. They are the same prefs as Kit's pane in
// about:preferences (bridge/startup/src/kit-preferences), with the same
// defaults; open windows observe them and update right away.

import { createSignal } from "solid-js";
import {
  DEFAULT_SIDEBAR_STATE,
  parseSidebarState,
  SIDEBAR_STATE_PREF,
} from "../neoworks-sidebar/sidebar-state-model.ts";
import type { SidebarState } from "../neoworks-sidebar/types.ts";
import type { SettingOption } from "./types.ts";

const TRANSPARENT_PREF = "neoworks.window.transparent";
const GLASS_TINT_PREF = "neoworks.glass.tint";
const ARCHIVE_AFTER_PREF = "neoworks.tabs.archiveAfterHours";

export const SIDEBAR_STATE_OPTIONS: SettingOption<SidebarState>[] = [
  { value: "expanded", label: "Expanded" },
  { value: "compact", label: "Icons only" },
  { value: "hidden", label: "Hidden" },
];

export const GLASS_TINT_OPTIONS: SettingOption<string>[] = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "strong", label: "Strong" },
];

// Hours; 0 is never.
export const ARCHIVE_AFTER_OPTIONS: SettingOption<number>[] = [
  { value: 0, label: "Never" },
  { value: 12, label: "12 hours" },
  { value: 24, label: "1 day" },
  { value: 72, label: "3 days" },
  { value: 168, label: "7 days" },
];

const [sidebarState, setSidebarStateSignal] = createSignal<SidebarState>(DEFAULT_SIDEBAR_STATE);
const [transparent, setTransparentSignal] = createSignal(false);
const [glassTint, setGlassTintSignal] = createSignal("medium");
const [archiveAfterHours, setArchiveAfterSignal] = createSignal(168);

export { archiveAfterHours, glassTint, sidebarState, transparent };

export function readSettings(): void {
  setSidebarStateSignal(
    parseSidebarState(Services.prefs.getStringPref(SIDEBAR_STATE_PREF, DEFAULT_SIDEBAR_STATE)),
  );
  setTransparentSignal(Services.prefs.getBoolPref(TRANSPARENT_PREF, false));
  setGlassTintSignal(Services.prefs.getStringPref(GLASS_TINT_PREF, "medium") || "medium");
  setArchiveAfterSignal(Services.prefs.getIntPref(ARCHIVE_AFTER_PREF, 168));
}

export function setSidebarState(value: SidebarState): void {
  Services.prefs.setStringPref(SIDEBAR_STATE_PREF, value);
  setSidebarStateSignal(value);
}

export function setTransparent(value: boolean): void {
  Services.prefs.setBoolPref(TRANSPARENT_PREF, value);
  setTransparentSignal(value);
}

export function setGlassTint(value: string): void {
  Services.prefs.setStringPref(GLASS_TINT_PREF, value);
  setGlassTintSignal(value);
}

export function setArchiveAfterHours(value: number): void {
  Services.prefs.setIntPref(ARCHIVE_AFTER_PREF, value);
  setArchiveAfterSignal(value);
}
