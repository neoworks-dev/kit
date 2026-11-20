// SPDX-License-Identifier: MPL-2.0

import {
  isFrequentHit,
  isLearnedHit,
  queryTokens,
  rankCandidates,
} from "./history-rank.ts";
import type { HistoryCandidate, SpotlightResult } from "./types.ts";
import { tabUrl } from "../neoworks-window-sync/mirrors.ts";

// Enough rows for ranking to reorder and for open tabs to be dropped.
const MAX_CANDIDATES = 30;
const MAX_TOKENS = 6;

interface PlacesRow {
  getResultByName(name: string): string | number | null;
}

interface PlacesConnection {
  executeCached(
    sql: string,
    params: Record<string, string | number>,
  ): Promise<PlacesRow[]>;
}

const browserWindow = window as unknown as {
  PlacesUtils: { promiseDBConnection(): Promise<PlacesConnection> };
};

const { UrlbarUtils } = ChromeUtils.importESModule(
  "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs",
) as {
  UrlbarUtils: {
    addToInputHistoryWhenReady(url: string, input: string): Promise<void>;
  };
};

// Every typed word has to appear in the URL or title; pages picked before for
// this input (moz_inputhistory, the urlbar's adaptive history) match anyway.
function historyQuery(tokenCount: number): string {
  const tokenMatches = Array.from(
    { length: tokenCount },
    (_, index) =>
      `(p.url LIKE :token${index} ESCAPE '/' OR p.title LIKE :token${index} ESCAPE '/')`,
  ).join(" AND ");
  return `
    SELECT p.url, p.title, p.visit_count,
           EXISTS (SELECT 1 FROM moz_bookmarks b WHERE b.fk = p.id) AS bookmarked,
           IFNULL((SELECT MAX(i.use_count) FROM moz_inputhistory i
                   WHERE i.place_id = p.id
                     AND i.input BETWEEN :input AND :input || X'FFFF'), 0) AS input_use
    FROM moz_places p
    WHERE p.hidden = 0
      AND ((${tokenMatches})
        OR p.id IN (SELECT place_id FROM moz_inputhistory
                    WHERE input BETWEEN :input AND :input || X'FFFF'))
    ORDER BY input_use DESC, p.frecency DESC
    LIMIT :limit`;
}

// Firefox's origin autofill: the most frecent visited origin whose host (with
// or without `www.`) starts with what was typed. Hosts include the port. Like
// the urlbar, only origins over Places' frecency threshold qualify, so a site
// visited once doesn't take over a prefix.
const ORIGIN_QUERY = `
  SELECT prefix, host
  FROM moz_origins
  WHERE prefix NOT IN ('about:', 'place:')
    AND frecency >= IFNULL(
      (SELECT value FROM moz_meta WHERE key = 'origin_frecency_threshold'), 2.0)
    AND ((host BETWEEN :host AND :host || X'FFFF')
      OR (host BETWEEN 'www.' || :host AND 'www.' || :host || X'FFFF'))
  ORDER BY frecency DESC, prefix = 'https://' DESC
  LIMIT 1`;

// Only a bare host prefix autofills an origin: no spaces, scheme or path.
function autofillHost(query: string): string {
  if (/[\s/]/.test(query)) {
    return "";
  }
  return query.toLowerCase();
}

async function originResult(
  connection: PlacesConnection,
  query: string,
): Promise<SpotlightResult | null> {
  const host = autofillHost(query);
  if (!host) {
    return null;
  }
  const [row] = await connection.executeCached(ORIGIN_QUERY, { host });
  if (!row) {
    return null;
  }
  const origin = String(row.getResultByName("host"));
  const url = String(row.getResultByName("prefix")) + origin + "/";
  return { kind: "history", title: origin, subtitle: url, url, topHit: true };
}

function likePattern(token: string): string {
  const escaped = token.replace(/[/%_]/g, (character) => "/" + character);
  return "%" + escaped + "%";
}

function rowToCandidate(row: PlacesRow): HistoryCandidate {
  return {
    url: String(row.getResultByName("url")),
    title: String(row.getResultByName("title") ?? ""),
    bookmarked: Boolean(row.getResultByName("bookmarked")),
    visitCount: Number(row.getResultByName("visit_count")),
    inputUse: Number(row.getResultByName("input_use")),
  };
}

function candidateToResult(candidate: HistoryCandidate): SpotlightResult {
  const { url } = candidate;
  const title = candidate.title || url;
  if (candidate.bookmarked) {
    return { kind: "bookmark", title, subtitle: url, url };
  }
  return { kind: "history", title, subtitle: url, url };
}

export function resultUrl(result: SpotlightResult): string {
  if ("url" in result) {
    return result.url;
  }
  if (result.kind === "tab") {
    return tabUrl(result.tab);
  }
  if (result.kind === "archived") {
    return result.archived.url;
  }
  return "";
}

export interface HistoryResults {
  topHit: SpotlightResult | null;
  // Ranked best first; open tabs are not filtered out yet.
  places: SpotlightResult[];
}

// Top hit, in order: a page picked for this input before, the visited origin
// the input starts, a frequently visited page every word starts a part of.
async function chooseTopHit(
  connection: PlacesConnection,
  query: string,
  ranked: HistoryCandidate[],
): Promise<SpotlightResult | null> {
  const learned = ranked.find(isLearnedHit);
  if (learned) {
    return { ...candidateToResult(learned), topHit: true };
  }
  const origin = await originResult(connection, query);
  if (origin) {
    return origin;
  }
  const frequent = ranked.find((candidate) => isFrequentHit(query, candidate));
  if (frequent) {
    return { ...candidateToResult(frequent), topHit: true };
  }
  return null;
}

export async function historyResults(
  query: string,
  withTopHit: boolean,
): Promise<HistoryResults> {
  const tokens = queryTokens(query).slice(0, MAX_TOKENS);
  if (tokens.length === 0) {
    return { topHit: null, places: [] };
  }
  const params: Record<string, string | number> = {
    input: query.toLowerCase(),
    limit: MAX_CANDIDATES,
  };
  tokens.forEach((token, index) => {
    params["token" + index] = likePattern(token);
  });
  const connection = await browserWindow.PlacesUtils.promiseDBConnection();
  const rows = await connection.executeCached(
    historyQuery(tokens.length),
    params,
  );
  const ranked = rankCandidates(query, rows.map(rowToCandidate));
  let topHit: SpotlightResult | null = null;
  if (withTopHit) {
    topHit = await chooseTopHit(connection, query, ranked);
  }
  return { topHit, places: ranked.map(candidateToResult) };
}

// Teaches the top hit which page this input means, as picking a urlbar
// result does.
export function rememberPick(query: string, url: string): void {
  if (!query || !url) {
    return;
  }
  UrlbarUtils.addToInputHistoryWhenReady(url, query).catch((error: unknown) =>
    console.error("[neoworks-spotlight] Recording input history failed:", error)
  );
}
