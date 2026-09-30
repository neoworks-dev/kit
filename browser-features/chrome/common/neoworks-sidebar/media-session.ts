// SPDX-License-Identifier: MPL-2.0

// Which tab the sidebar's player controls: the one playing, or else the one
// that played last while it still has media. Follows every tab, including
// those of other workspaces, through Firefox's per-tab MediaController.

import { createMemo, createSignal, onCleanup } from "solid-js";
import { tabbrowser } from "./tabbrowser.ts";
import type { BrowserTab, MediaSession, TabState } from "./types.ts";

const CONTROLLER_EVENTS = [
  "activated",
  "deactivated",
  "metadatachange",
  "playbackstatechange",
  "supportedkeyschange",
];

function controllerOf(tab: BrowserTab): MediaController | null {
  try {
    return tab.linkedBrowser.browsingContext?.mediaController ?? null;
  } catch {
    // Tabs being set up or torn down have no usable browser yet.
    return null;
  }
}

// Call inside a component: listeners are removed on cleanup.
export function createMediaSession(tabState: TabState): () => MediaSession | null {
  const [revision, setRevision] = createSignal(0);
  const bump = () => setRevision((value) => value + 1);
  const watched = new Map<BrowserTab, MediaController>();
  let lastPlayed: BrowserTab | null = null;

  function unwatch(tab: BrowserTab, controller: MediaController): void {
    for (const eventName of CONTROLLER_EVENTS) {
      controller.removeEventListener(eventName, bump);
    }
    watched.delete(tab);
  }

  // A tab's controller changes when a navigation swaps its browsing context.
  function syncWatched(tabs: BrowserTab[]): void {
    const open = new Set(tabs);
    for (const [tab, controller] of watched) {
      if (!open.has(tab) || controllerOf(tab) !== controller) {
        unwatch(tab, controller);
      }
    }
    for (const tab of tabs) {
      const controller = controllerOf(tab);
      if (!controller || watched.has(tab)) {
        continue;
      }
      for (const eventName of CONTROLLER_EVENTS) {
        controller.addEventListener(eventName, bump);
      }
      watched.set(tab, controller);
    }
  }

  const session = createMemo((): MediaSession | null => {
    tabState.revision();
    revision();
    const tabs = tabbrowser().tabs;
    syncWatched(tabs);

    const active = tabs.filter((tab) => watched.get(tab)?.isActive);
    const playing = active.find((tab) => watched.get(tab)?.isPlaying);
    if (playing) {
      lastPlayed = playing;
    }
    let tab = playing;
    if (!tab && lastPlayed && active.includes(lastPlayed)) {
      tab = lastPlayed;
    }
    tab ??= active[0];
    const controller = tab && watched.get(tab);
    if (!tab || !controller) {
      return null;
    }
    return { tab, controller };
  }, null, { equals: false });

  onCleanup(() => {
    for (const [tab, controller] of watched) {
      unwatch(tab, controller);
    }
  });

  return session;
}
