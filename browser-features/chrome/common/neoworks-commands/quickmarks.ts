// SPDX-License-Identifier: MPL-2.0

// Vim quickmarks: `m<letter>` remembers the current page, `'<letter>` returns
// to it (switching to an open tab with that URL when there is one).

import {
  isQuickmarkLetter,
  type NWCommandInvocation,
} from "#features-modules/common/NWKeymap.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import type { NeoworksCommand } from "./registry.ts";

export interface Quickmark {
  letter: string;
  url: string;
  title: string;
}

const QUICKMARKS_PREF = "neoworks.quickmarks";

const browserWindow = window as unknown as {
  openTrustedLinkIn(url: string, where: string): void;
};

function isQuickmark(value: unknown): value is Quickmark {
  const candidate = value as Partial<Quickmark> | null;
  if (!candidate || !isQuickmarkLetter(candidate.letter)) {
    return false;
  }
  return typeof candidate.url === "string" && typeof candidate.title === "string";
}

export function readQuickmarks(): Quickmark[] {
  const stored = Services.prefs.getStringPref(QUICKMARKS_PREF, "[]");
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isQuickmark);
  } catch (error) {
    console.error("[neoworks-commands] Ignoring corrupt quickmarks pref:", error);
    return [];
  }
}

function writeQuickmarks(quickmarks: Quickmark[]): void {
  const sorted = [...quickmarks].sort((first, second) =>
    first.letter.localeCompare(second.letter)
  );
  Services.prefs.setStringPref(QUICKMARKS_PREF, JSON.stringify(sorted));
}

function setQuickmark(invocation: NWCommandInvocation): void {
  const letter = invocation.letter;
  if (!isQuickmarkLetter(letter)) {
    return;
  }
  const browser = tabbrowser().selectedBrowser;
  const url = browser.currentURI.spec;
  const others = readQuickmarks().filter((quickmark) => quickmark.letter !== letter);
  writeQuickmarks([...others, { letter, url, title: browser.contentTitle || url }]);
}

export function jumpToQuickmark(quickmark: Quickmark): void {
  const browser = tabbrowser();
  const openTab = browser.tabs.find((tab) => tab.linkedBrowser.currentURI.spec === quickmark.url);
  if (openTab) {
    browser.selectedTab = openTab;
    return;
  }
  browserWindow.openTrustedLinkIn(quickmark.url, "current");
}

function jumpToLetter(invocation: NWCommandInvocation): void {
  const quickmark = readQuickmarks().find((entry) => entry.letter === invocation.letter);
  if (quickmark) {
    jumpToQuickmark(quickmark);
  }
}

export const QUICKMARK_COMMANDS: NeoworksCommand[] = [
  { id: "quickmark:set", title: "Set Quickmark", listed: false, run: setQuickmark },
  { id: "quickmark:jump", title: "Jump to Quickmark", listed: false, run: jumpToLetter },
];
