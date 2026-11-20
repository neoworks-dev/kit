// SPDX-License-Identifier: MPL-2.0

// !bangs: "!yt cats" or "cats !yt" searches YouTube directly, resolved here
// without a round-trip through a search engine. "!yt" alone opens the site.
// The list is Kagi's (bangs.json, see tools/scripts/update-bangs.ts), loaded
// the first time a "!" is typed.

import type { BangEntry, BangQuery } from "./types.ts";

// Kagi's URL formats, as stored in BangEntry.formats.
export const BANG_FORMAT = {
  // The bang alone opens the search URL's origin and path, not the domain.
  openBasePath: 1,
  // The bang alone opens the domain; set on sites whose search URL is
  // elsewhere.
  openSnapDomain: 2,
  urlEncodeTerms: 4,
  spaceAsPlus: 8,
} as const;

const DEFAULT_FORMATS = BANG_FORMAT.openBasePath | BANG_FORMAT.urlEncodeTerms |
  BANG_FORMAT.spaceAsPlus;

const TERMS_PLACEHOLDER = "{{{s}}}";

// Kit's own triggers, ahead of Kagi's: !y is Yahoo there.
const KIT_TRIGGERS: Record<string, string> = { y: "yt" };

// A "!" token at the start or after a space; the first one is the bang.
const BANG_TOKEN = /(?:^|\s)!(\S+)/;

// "!yt cats", "cats !yt" and "cats !yt more" all give trigger "yt".
export function parseBangQuery(query: string): BangQuery | null {
  const match = BANG_TOKEN.exec(query);
  if (!match) {
    return null;
  }
  const terms = (query.slice(0, match.index) + " " +
    query.slice(match.index + match[0].length))
    .replace(/\s+/g, " ")
    .trim();
  return { trigger: match[1].toLowerCase(), terms };
}

function hasFormat(entry: BangEntry, format: number): boolean {
  return ((entry.formats ?? DEFAULT_FORMATS) & format) !== 0;
}

function encodeTerms(entry: BangEntry, terms: string): string {
  if (!hasFormat(entry, BANG_FORMAT.urlEncodeTerms)) {
    return terms;
  }
  const encoded = encodeURIComponent(terms);
  if (hasFormat(entry, BANG_FORMAT.spaceAsPlus)) {
    return encoded.replaceAll("%20", "+");
  }
  return encoded;
}

// Where the bang alone goes.
function siteUrl(entry: BangEntry): string {
  if (
    hasFormat(entry, BANG_FORMAT.openBasePath) &&
    !hasFormat(entry, BANG_FORMAT.openSnapDomain)
  ) {
    const url = new URL(entry.url.replaceAll(TERMS_PLACEHOLDER, ""));
    return url.origin + url.pathname;
  }
  return "https://" + entry.domain + "/";
}

export function bangUrl(entry: BangEntry, terms: string): string {
  if (!terms) {
    return siteUrl(entry);
  }
  return entry.url.replaceAll(TERMS_PLACEHOLDER, encodeTerms(entry, terms));
}

export function bangIcon(entry: BangEntry): string {
  return "page-icon:https://" + entry.domain + "/";
}

// Trigger → site; built once the list has loaded.
export type BangIndex = Map<string, BangEntry>;

export function buildBangIndex(entries: BangEntry[]): BangIndex {
  const index: BangIndex = new Map();
  for (const entry of entries) {
    for (const trigger of entry.triggers) {
      // The list is sorted by name; the first site to claim a trigger keeps it.
      if (!index.has(trigger)) {
        index.set(trigger, entry);
      }
    }
  }
  for (const [trigger, target] of Object.entries(KIT_TRIGGERS)) {
    const entry = index.get(target);
    if (entry) {
      index.set(trigger, entry);
    }
  }
  return index;
}

// Sites whose trigger starts with `prefix`, an exact match first, then
// shorter triggers, which are the common ones.
export function bangsStartingWith(
  index: BangIndex,
  prefix: string,
  limit: number,
): { trigger: string; entry: BangEntry }[] {
  const matches: { trigger: string; entry: BangEntry }[] = [];
  for (const [trigger, entry] of index) {
    if (trigger.startsWith(prefix)) {
      matches.push({ trigger, entry });
    }
  }
  matches.sort((first, second) => first.trigger.length - second.trigger.length);
  const seen = new Set<BangEntry>();
  return matches.filter(({ entry }) => {
    if (seen.has(entry)) {
      return false;
    }
    seen.add(entry);
    return true;
  }).slice(0, limit);
}

let index: BangIndex | null = null;
let loading: Promise<BangIndex> | null = null;

// Null until loadBangs() has finished.
export function bangIndex(): BangIndex | null {
  return index;
}

export function loadBangs(): Promise<BangIndex> {
  loading ??= fetch(new URL("./bangs.json", import.meta.url))
    .then((response) => response.json() as Promise<unknown>)
    .then((entries) => {
      index = buildBangIndex(entries as BangEntry[]);
      return index;
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}
