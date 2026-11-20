// SPDX-License-Identifier: MPL-2.0

// Browser-independent rules for the sidebar's three states and the shortcut
// that switches between two of them, kept apart from sidebar-state.ts so they
// can be tested without prefs.

import type { SidebarState, SidebarTogglePair } from "./types.ts";

export const SIDEBAR_STATE_PREF = "neoworks.sidebar.state";
export const SIDEBAR_TOGGLE_PREF = "neoworks.sidebar.toggle";
// Before the three states the sidebar was docked or not; read once to carry
// the choice over.
export const LEGACY_DOCKED_PREF = "neoworks.sidebar.docked";

export const DEFAULT_SIDEBAR_STATE: SidebarState = "expanded";
export const DEFAULT_SIDEBAR_TOGGLE: SidebarTogglePair = "expanded-hidden";

const TOGGLE_PAIRS: Record<SidebarTogglePair, [SidebarState, SidebarState]> = {
  "expanded-hidden": ["expanded", "hidden"],
  "expanded-compact": ["expanded", "compact"],
  "compact-hidden": ["compact", "hidden"],
};

export function parseSidebarState(value: unknown): SidebarState {
  if (value === "hidden" || value === "compact" || value === "expanded") {
    return value;
  }
  return DEFAULT_SIDEBAR_STATE;
}

export function parseSidebarTogglePair(value: unknown): SidebarTogglePair {
  if (
    value === "expanded-hidden" || value === "expanded-compact" ||
    value === "compact-hidden"
  ) {
    return value;
  }
  return DEFAULT_SIDEBAR_TOGGLE;
}

export function statesOfPair(
  pair: SidebarTogglePair,
): [SidebarState, SidebarState] {
  return TOGGLE_PAIRS[pair];
}

// The other state of the pair; from the state outside the pair, the first.
export function nextSidebarState(
  current: SidebarState,
  pair: SidebarTogglePair,
): SidebarState {
  const [first, second] = statesOfPair(pair);
  if (current === first) {
    return second;
  }
  return first;
}

export function stateFromDocked(docked: boolean): SidebarState {
  if (docked) {
    return "expanded";
  }
  return "hidden";
}

// Compact and expanded both take room beside the page.
export function takesRoom(state: SidebarState): boolean {
  return state !== "hidden";
}
