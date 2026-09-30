// SPDX-License-Identifier: MPL-2.0

import { type Accessor, createSignal, onCleanup } from "solid-js";
import { getBoolPref, setBoolPref } from "../lib/prefs.ts";
import type { BackgroundSettings } from "./types.ts";

export const BACKGROUND_ENABLED_PREF = "neoworks.newtab.background.enabled";
export const BACKGROUND_SHUFFLE_PREF = "neoworks.newtab.background.shuffle";

function loadSettings(): BackgroundSettings {
  try {
    return {
      enabled: getBoolPref(BACKGROUND_ENABLED_PREF, true),
      shuffle: getBoolPref(BACKGROUND_SHUFFLE_PREF, false),
    };
  } catch (e) {
    console.error("[NewTab] Failed to load background settings:", e);
    return { enabled: true, shuffle: false };
  }
}

export function createBackgroundSettings(): {
  settings: Accessor<BackgroundSettings>;
  update: (patch: Partial<BackgroundSettings>) => void;
} {
  const [settings, setSettings] = createSignal(loadSettings());

  // Another new tab may have changed them while this one was hidden.
  const onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    const next = loadSettings();
    const current = settings();
    if (next.enabled !== current.enabled || next.shuffle !== current.shuffle) {
      setSettings(next);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  onCleanup(() => {
    document.removeEventListener("visibilitychange", onVisibility);
  });

  const update = (patch: Partial<BackgroundSettings>) => {
    const next = { ...settings(), ...patch };
    setSettings(next);
    try {
      setBoolPref(BACKGROUND_ENABLED_PREF, next.enabled);
      setBoolPref(BACKGROUND_SHUFFLE_PREF, next.shuffle);
    } catch (e) {
      console.error("[NewTab] Failed to save background settings:", e);
    }
  };

  return { settings, update };
}
