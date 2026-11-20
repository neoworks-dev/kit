// SPDX-License-Identifier: MPL-2.0

import type { NWCommandId } from "#features-modules/common/NWKeymap.ts";
import type { Quickmark } from "../neoworks-commands/quickmarks.ts";
import type {
  ArchivedTab,
  BrowserTab,
  Workspace,
} from "../neoworks-sidebar/types.ts";

interface ResultText {
  title: string;
  subtitle: string;
  // The row Enter runs before anything is highlighted; shown first, unlabeled.
  topHit?: boolean;
  // Overrides the kind's icon, e.g. the search engine's or a bang site's.
  icon?: string;
}

export type UrlResultKind = "navigate" | "suggestion" | "bookmark" | "history";

export type SpotlightResult =
  | ResultText & { kind: UrlResultKind; url: string }
  | ResultText & { kind: "tab"; tab: BrowserTab }
  | ResultText & { kind: "archived"; archived: ArchivedTab }
  | ResultText & { kind: "quickmark"; quickmark: Quickmark }
  | ResultText & { kind: "workspace"; workspace: Workspace; shortcut: string }
  | ResultText & { kind: "command"; command: NWCommandId; shortcut: string }
  // `terms` empty: the bang alone, which opens the site; Tab completes it.
  | ResultText & { kind: "bang"; url: string; trigger: string; terms: string };

export type SpotlightResultKind = SpotlightResult["kind"];

// A moz_places row matching the query, before ranking.
export interface HistoryCandidate {
  url: string;
  title: string;
  bookmarked: boolean;
  visitCount: number;
  // moz_inputhistory use count for inputs starting with the query: +1 per
  // pick, approaching 10.
  inputUse: number;
}

// One site from bangs.json (tools/scripts/update-bangs.ts, from Kagi's list).
export interface BangEntry {
  name: string;
  // For the favicon and for the bang alone.
  domain: string;
  // Lowercase, without the "!".
  triggers: string[];
  // Search URL; {{{s}}} stands for the terms.
  url: string;
  // Kagi's formats as BANG_FORMAT flags (bangs.ts); absent is Kagi's default.
  formats?: number;
}

// A bang typed into the spotlight: its trigger and the rest of the input.
export interface BangQuery {
  trigger: string;
  terms: string;
}

export interface SearchEngineInfo {
  name: string;
  // Empty when the engine has none.
  icon: string;
}
