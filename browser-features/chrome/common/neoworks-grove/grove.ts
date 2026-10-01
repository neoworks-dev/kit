// SPDX-License-Identifier: MPL-2.0

// The window's view of Kit's Grove connection (NWGrove.sys.mts): whether the
// developer setting is on, and the connection's state, as signals for the
// tab menu and the tab's frame.

import { createSignal } from "solid-js";
import type { GroveState } from "./types.ts";

export type GroveModule = typeof import("../../../modules/modules/NWGrove.sys.mts");

export function groveModule(): GroveModule {
  return ChromeUtils.importESModule("resource://noraneko/modules/NWGrove.sys.mjs") as GroveModule;
}

const [enabled, setEnabled] = createSignal(false);
const [state, setState] = createSignal<GroveState>("off");
// Bumped whenever the served tabs change.
const [revision, setRevision] = createSignal(0);

export { enabled as groveEnabled, revision as groveRevision, state as groveState };

function refresh(): void {
  const grove = groveModule();
  setEnabled(grove.isGroveEnabled());
  setState(grove.groveStatus().state);
  setRevision((value) => value + 1);
}

const observer = {
  observe(): void {
    refresh();
  },
};

// Follows the setting and the connection; returns the stop function.
export function watchGrove(): () => void {
  const grove = groveModule();
  grove.initGrove();
  Services.prefs.addObserver(grove.GROVE_ENABLED_PREF, observer);
  Services.obs.addObserver(observer, grove.GROVE_CHANGED_TOPIC);
  refresh();
  return () => {
    Services.prefs.removeObserver(grove.GROVE_ENABLED_PREF, observer);
    Services.obs.removeObserver(observer, grove.GROVE_CHANGED_TOPIC);
  };
}

// What the tab menu says while Kit can't offer worktrees.
export function stateNote(current: GroveState): string {
  switch (current) {
    case "searching":
      return "Grove isn't running";
    case "connecting":
      return "Connecting to Grove…";
    case "pairing":
      return "Approve Kit in Grove";
    case "denied":
      return "Grove turned Kit down";
    default:
      return "";
  }
}
