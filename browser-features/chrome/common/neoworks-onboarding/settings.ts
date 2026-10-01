// SPDX-License-Identifier: MPL-2.0

// The settings the setup asks about. They are the same prefs as Kit's pane in
// about:preferences (bridge/startup/src/kit-preferences), with the same
// defaults; open windows observe them and update right away.

import { createSignal } from "solid-js";
import type { SettingOption } from "./types.ts";

const DOCKED_PREF = "neoworks.sidebar.docked";
const TRANSPARENT_PREF = "neoworks.window.transparent";
const GLASS_TINT_PREF = "neoworks.glass.tint";
const ARCHIVE_AFTER_PREF = "neoworks.tabs.archiveAfterHours";

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

const [docked, setDockedSignal] = createSignal(true);
const [transparent, setTransparentSignal] = createSignal(false);
const [glassTint, setGlassTintSignal] = createSignal("medium");
const [archiveAfterHours, setArchiveAfterSignal] = createSignal(24);

export { archiveAfterHours, docked, glassTint, transparent };

export function readSettings(): void {
  setDockedSignal(Services.prefs.getBoolPref(DOCKED_PREF, true));
  setTransparentSignal(Services.prefs.getBoolPref(TRANSPARENT_PREF, false));
  setGlassTintSignal(Services.prefs.getStringPref(GLASS_TINT_PREF, "medium") || "medium");
  setArchiveAfterSignal(Services.prefs.getIntPref(ARCHIVE_AFTER_PREF, 24));
}

export function setDocked(value: boolean): void {
  Services.prefs.setBoolPref(DOCKED_PREF, value);
  setDockedSignal(value);
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
