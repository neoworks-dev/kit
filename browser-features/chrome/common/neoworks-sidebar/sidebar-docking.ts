// SPDX-License-Identifier: MPL-2.0

// The sidebar is either docked (a full-height panel beside the top bar and the
// page) or floats over the page (see sidebar-visibility.ts). The mode lives in
// a pref; the root attribute lets the stylesheets lay out the window for it.

import { createSignal } from "solid-js";

const DOCKED_PREF = "neoworks.sidebar.docked";
const DOCKED_BY_DEFAULT = true;
const DOCKED_ATTRIBUTE = "nw-sidebar-docked";

function readDocked(): boolean {
  return Services.prefs.getBoolPref(DOCKED_PREF, DOCKED_BY_DEFAULT);
}

const [docked, setDocked] = createSignal(readDocked());

export const sidebarDocked = docked;

function applyDocked(isDocked: boolean): void {
  setDocked(isDocked);
  document.documentElement.toggleAttribute(DOCKED_ATTRIBUTE, isDocked);
}

export function toggleSidebarDocked(): void {
  Services.prefs.setBoolPref(DOCKED_PREF, !docked());
}

// Returns a stop function for hot reload.
export function watchSidebarDocking(): () => void {
  const observer = { observe: () => applyDocked(readDocked()) };
  Services.prefs.addObserver(DOCKED_PREF, observer);
  applyDocked(readDocked());
  return () => {
    Services.prefs.removeObserver(DOCKED_PREF, observer);
    document.documentElement.removeAttribute(DOCKED_ATTRIBUTE);
  };
}
