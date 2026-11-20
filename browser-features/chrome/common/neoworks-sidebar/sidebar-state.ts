// SPDX-License-Identifier: MPL-2.0

// The sidebar is expanded (a full-height column of titled rows beside the top
// bar and the page), compact (the same column narrowed to icons) or hidden
// (it floats over the page, see sidebar-visibility.ts). The state lives in a
// pref; root attributes let the stylesheets lay out the window for it.
// nw-sidebar-docked marks both states that take room, which other features'
// stylesheets key on too.

import { createSignal } from "solid-js";
import {
  LEGACY_DOCKED_PREF,
  nextSidebarState,
  parseSidebarState,
  parseSidebarTogglePair,
  SIDEBAR_STATE_PREF,
  SIDEBAR_TOGGLE_PREF,
  stateFromDocked,
  takesRoom,
} from "./sidebar-state-model.ts";
import type { SidebarState } from "./types.ts";

const DOCKED_ATTRIBUTE = "nw-sidebar-docked";
const COMPACT_ATTRIBUTE = "nw-sidebar-compact";

function readState(): SidebarState {
  return parseSidebarState(
    Services.prefs.getStringPref(SIDEBAR_STATE_PREF, ""),
  );
}

const [state, setState] = createSignal(readState());

export const sidebarState = state;

export function sidebarDocked(): boolean {
  return takesRoom(state());
}

export function sidebarCompact(): boolean {
  return state() === "compact";
}

// Icons only, a row's title becomes its tooltip. Tabs have their preview
// card instead.
export function compactTitle(title: string): string | undefined {
  if (sidebarCompact()) {
    return title;
  }
  return undefined;
}

function applyState(nextState: SidebarState): void {
  setState(nextState);
  const root = document.documentElement;
  root.toggleAttribute(DOCKED_ATTRIBUTE, takesRoom(nextState));
  root.toggleAttribute(COMPACT_ATTRIBUTE, nextState === "compact");
}

export function setSidebarState(nextState: SidebarState): void {
  Services.prefs.setStringPref(SIDEBAR_STATE_PREF, nextState);
}

// Switches between the two states picked in Kit's settings.
export function toggleSidebar(): void {
  const pair = parseSidebarTogglePair(
    Services.prefs.getStringPref(SIDEBAR_TOGGLE_PREF, ""),
  );
  setSidebarState(nextSidebarState(state(), pair));
}

// The old boolean pref, carried over and cleared: once at startup, and again
// whenever something still writes it (the first-launch setup does).
function adoptLegacyDocked(): void {
  if (!Services.prefs.prefHasUserValue(LEGACY_DOCKED_PREF)) {
    return;
  }
  const docked = Services.prefs.getBoolPref(LEGACY_DOCKED_PREF, true);
  Services.prefs.clearUserPref(LEGACY_DOCKED_PREF);
  setSidebarState(stateFromDocked(docked));
}

// Returns a stop function for hot reload.
export function watchSidebarState(): () => void {
  const stateObserver = { observe: () => applyState(readState()) };
  const legacyObserver = { observe: adoptLegacyDocked };
  adoptLegacyDocked();
  Services.prefs.addObserver(SIDEBAR_STATE_PREF, stateObserver);
  Services.prefs.addObserver(LEGACY_DOCKED_PREF, legacyObserver);
  applyState(readState());
  return () => {
    Services.prefs.removeObserver(SIDEBAR_STATE_PREF, stateObserver);
    Services.prefs.removeObserver(LEGACY_DOCKED_PREF, legacyObserver);
    document.documentElement.removeAttribute(DOCKED_ATTRIBUTE);
    document.documentElement.removeAttribute(COMPACT_ATTRIBUTE);
  };
}
