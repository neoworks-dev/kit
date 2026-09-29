// SPDX-License-Identifier: MPL-2.0

import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import type { SpotlightResult } from "./types.ts";

const MAX_TAB_RESULTS = 4;
const MAX_PLACES_RESULTS = 6;

interface PlacesRow {
  getResultByName(name: string): string | number | null;
}

interface PlacesConnection {
  executeCached(sql: string, params: Record<string, string | number>): Promise<PlacesRow[]>;
}

const browserWindow = window as unknown as {
  PlacesUtils: { promiseDBConnection(): Promise<PlacesConnection> };
};

const uriFixupFlags = Ci.nsIURIFixup as unknown as {
  FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP: number;
  FIXUP_FLAG_FIX_SCHEME_TYPOS: number;
};

const PLACES_QUERY = `
  SELECT p.url, p.title,
         EXISTS (SELECT 1 FROM moz_bookmarks b WHERE b.fk = p.id) AS bookmarked
  FROM moz_places p
  WHERE p.hidden = 0
    AND (p.url LIKE :pattern ESCAPE '/' OR p.title LIKE :pattern ESCAPE '/')
  ORDER BY bookmarked DESC, p.frecency DESC
  LIMIT :limit`;

function likePattern(query: string): string {
  const escaped = query.replace(/[/%_]/g, (character) => "/" + character);
  return "%" + escaped + "%";
}

function textMatches(query: string, ...values: string[]): boolean {
  const needle = query.toLowerCase();
  return values.some((value) => value.toLowerCase().includes(needle));
}

// Firefox's URL fixup decides between "open this URL" and "search for this",
// using the default search engine for the latter.
export function navigateResult(query: string): SpotlightResult | null {
  const fixupFlags = uriFixupFlags.FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP |
    uriFixupFlags.FIXUP_FLAG_FIX_SCHEME_TYPOS;
  try {
    const fixupInfo = Services.uriFixup.getFixupURIInfo(query, fixupFlags);
    const url = fixupInfo.preferredURI.spec;
    if (fixupInfo.keywordProviderName) {
      return {
        kind: "navigate",
        title: query,
        subtitle: "Search with " + fixupInfo.keywordProviderName,
        url,
      };
    }
    return { kind: "navigate", title: url, subtitle: "Open", url };
  } catch {
    return null;
  }
}

export function tabResults(query: string): SpotlightResult[] {
  const results: SpotlightResult[] = [];
  for (const tab of tabbrowser().nonHiddenTabs) {
    const url = tab.linkedBrowser.currentURI.spec;
    if (!textMatches(query, tab.label, url)) {
      continue;
    }
    results.push({ kind: "tab", title: tab.label, subtitle: url, url, tab });
    if (results.length === MAX_TAB_RESULTS) {
      break;
    }
  }
  return results;
}

function rowToResult(row: PlacesRow): SpotlightResult {
  const url = String(row.getResultByName("url"));
  let title = url;
  if (row.getResultByName("title")) {
    title = String(row.getResultByName("title"));
  }
  let kind: SpotlightResult["kind"] = "history";
  if (row.getResultByName("bookmarked")) {
    kind = "bookmark";
  }
  return { kind, title, subtitle: url, url };
}

export async function placesResults(query: string): Promise<SpotlightResult[]> {
  const connection = await browserWindow.PlacesUtils.promiseDBConnection();
  const rows = await connection.executeCached(PLACES_QUERY, {
    pattern: likePattern(query),
    limit: MAX_PLACES_RESULTS,
  });
  return rows.map(rowToResult);
}
