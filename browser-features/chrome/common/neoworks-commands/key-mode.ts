// SPDX-License-Identifier: MPL-2.0

// Per-tab key mode as reported by the NWKeys actor. The actor owns the mode;
// chrome only mirrors it for the indicator of the selected tab.

import { createSignal } from "solid-js";
import type { NWKeyMode } from "#features-modules/common/NWKeymap.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";

interface KeyModeDetail {
  browser: Element;
  mode: NWKeyMode;
}

// Keyed by <browser> identity; tabbrowser's typing of it isn't an Element.
const insertModeBrowsers = new WeakSet<object>();
const [selectedTabMode, setSelectedTabMode] = createSignal<NWKeyMode>("normal");

export { selectedTabMode };

export function refreshSelectedTabMode(): void {
  if (insertModeBrowsers.has(tabbrowser().selectedBrowser)) {
    setSelectedTabMode("insert");
    return;
  }
  setSelectedTabMode("normal");
}

// Dispatched by NWKeysParent when a tab enters or leaves insert mode.
export function handleKeyModeEvent(event: Event): void {
  const { browser, mode } = (event as CustomEvent<KeyModeDetail>).detail;
  if (mode === "insert") {
    insertModeBrowsers.add(browser);
  } else {
    insertModeBrowsers.delete(browser);
  }
  refreshSelectedTabMode();
}
