// SPDX-License-Identifier: MPL-2.0

import type { SpotlightResult } from "./types.ts";

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

// Fetches extra rows so URLs already open as tabs can be dropped afterwards.
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

function rowToResult(row: PlacesRow): SpotlightResult {
  const url = String(row.getResultByName("url"));
  let title = url;
  if (row.getResultByName("title")) {
    title = String(row.getResultByName("title"));
  }
  if (row.getResultByName("bookmarked")) {
    return { kind: "bookmark", title, subtitle: url, url };
  }
  return { kind: "history", title, subtitle: url, url };
}

function resultUrl(result: SpotlightResult): string {
  if ("url" in result) {
    return result.url;
  }
  return "";
}

export async function placesResults(
  query: string,
  openUrls: Set<string>,
): Promise<SpotlightResult[]> {
  const connection = await browserWindow.PlacesUtils.promiseDBConnection();
  const rows = await connection.executeCached(PLACES_QUERY, {
    pattern: likePattern(query),
    limit: MAX_PLACES_RESULTS * 2,
  });
  return rows
    .map(rowToResult)
    .filter((result) => !openUrls.has(resultUrl(result)))
    .slice(0, MAX_PLACES_RESULTS);
}
