// SPDX-License-Identifier: MPL-2.0

import { bindingsForCommand, describeKeys } from "#features-modules/common/NWKeymap.ts";
import { readQuickmarks } from "../neoworks-commands/quickmarks.ts";
import {
  commandTitle,
  listedCommands,
  type NeoworksCommand,
} from "../neoworks-commands/registry.ts";
import { archivedTabs } from "../neoworks-sidebar/tab-archive.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import { activeWorkspaceId, workspaces } from "../neoworks-sidebar/workspaces.ts";
import { fuzzyScore, rankByScore } from "./fuzzy.ts";
import type { SpotlightResult } from "./types.ts";

const uriFixupFlags = Ci.nsIURIFixup as unknown as {
  FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP: number;
  FIXUP_FLAG_FIX_SCHEME_TYPOS: number;
};

const OPEN_URL_SUBTITLE = "Open";
const MAX_ARCHIVED_RESULTS = 8;
const SEARCH_SUBTITLE = "Search the web";

// Firefox's URL fixup decides between "open this URL" and "search for this",
// using the default search engine for the latter.
export function navigateResult(query: string): SpotlightResult | null {
  const fixupFlags = uriFixupFlags.FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP |
    uriFixupFlags.FIXUP_FLAG_FIX_SCHEME_TYPOS;
  try {
    const fixupInfo = Services.uriFixup.getFixupURIInfo(query, fixupFlags);
    const url = fixupInfo.preferredURI.spec;
    // Firefox 157 leaves keywordProviderName empty; keywordAsSent marks a search.
    if (fixupInfo.keywordAsSent) {
      return { kind: "navigate", title: query, subtitle: SEARCH_SUBTITLE, url };
    }
    return { kind: "navigate", title: url, subtitle: OPEN_URL_SUBTITLE, url };
  } catch {
    return null;
  }
}

// Addresses get no search suggestions; only text that would be searched does.
export function isSearchQuery(result: SpotlightResult | null): boolean {
  if (result?.kind !== "navigate") {
    return false;
  }
  return result.subtitle !== OPEN_URL_SUBTITLE;
}

export function openTabUrls(): Set<string> {
  return new Set(tabbrowser().nonHiddenTabs.map((tab) => tab.linkedBrowser.currentURI.spec));
}

function tabResults(): SpotlightResult[] {
  return tabbrowser().nonHiddenTabs.map((tab) => ({
    kind: "tab",
    title: tab.label,
    subtitle: tab.linkedBrowser.currentURI.spec,
    tab,
  }));
}

function archivedResults(): SpotlightResult[] {
  return archivedTabs().map((archived) => ({
    kind: "archived",
    title: archived.title,
    subtitle: archived.url,
    archived,
  }));
}

function quickmarkResults(): SpotlightResult[] {
  return readQuickmarks().map((quickmark) => ({
    kind: "quickmark",
    title: `'${quickmark.letter} ${quickmark.title}`,
    subtitle: quickmark.url,
    quickmark,
  }));
}

// Matches the g1–g9 bindings; later workspaces have no shortcut.
function workspaceShortcut(index: number): string {
  const number = String(index + 1);
  const binding = bindingsForCommand("workspace:switch").find((candidate) =>
    candidate.letter === number
  );
  if (!binding) {
    return "";
  }
  return describeKeys(binding.keys);
}

function workspaceSubtitle(workspaceId: string): string {
  if (workspaceId === activeWorkspaceId()) {
    return "Current";
  }
  return "";
}

function workspaceResults(): SpotlightResult[] {
  return workspaces().map((workspace, index) => ({
    kind: "workspace",
    title: workspace.name,
    subtitle: workspaceSubtitle(workspace.id),
    workspace,
    shortcut: workspaceShortcut(index),
  }));
}

function commandShortcut(command: NeoworksCommand): string {
  const binding = bindingsForCommand(command.id)[0];
  if (!binding) {
    return "";
  }
  return describeKeys(binding.keys);
}

function commandResults(): SpotlightResult[] {
  return listedCommands().map((command) => ({
    kind: "command",
    title: commandTitle(command.id),
    subtitle: "",
    command: command.id,
    shortcut: commandShortcut(command),
  }));
}

// Everything that can be listed without I/O: open tabs, workspaces,
// quickmarks, commands, then archived tabs once there is a query (the
// archive can hold hundreds).
export function localResults(query: string): SpotlightResult[] {
  const candidates = [
    ...tabResults(),
    ...workspaceResults(),
    ...quickmarkResults(),
    ...commandResults(),
  ];
  if (!query) {
    return candidates;
  }
  const score = (result: SpotlightResult) => resultScore(query, result);
  return [
    ...rankByScore(candidates, score),
    ...rankByScore(archivedResults(), score).slice(0, MAX_ARCHIVED_RESULTS),
  ];
}

// Titles match fuzzily; subtitles (mostly long URLs) only as plain substrings,
// since almost any letter sequence is a subsequence of a long URL.
function resultScore(query: string, result: SpotlightResult): number {
  const titleScore = fuzzyScore(query, result.title);
  if (titleScore >= 0) {
    return titleScore;
  }
  if (result.subtitle.toLowerCase().includes(query.toLowerCase())) {
    return 0;
  }
  return -1;
}
