// SPDX-License-Identifier: MPL-2.0

// Ranking for history and bookmark rows, the choice of a top hit and the
// inline completion the input shows for it. No Places access here.

import type { HistoryCandidate } from "./types.ts";

const URL_BOUNDARIES = " /.-_:?=&#+~";
const PREFIX_SCORE = 30;
const WORD_START_SCORE = 15;
const SUBSTRING_SCORE = 3;
const INPUT_USE_WEIGHT = 20;
const VISIT_WEIGHT = 4;
const BOOKMARK_SCORE = 10;

// Firefox's adaptive autofill threshold: one pick for this input clears it.
const INPUT_USE_THRESHOLD = 0.47;
// Without input history, a page has to have been visited this often to beat
// the search row.
const TOP_HIT_MIN_VISITS = 3;

export function queryTokens(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function withoutScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

// The URL as it reads in an address bar: no http(s) scheme, no `www.`.
export function displayUrl(url: string): string {
  return withoutScheme(url).replace(/^www\./, "");
}

function startsWord(text: string, token: string): boolean {
  let index = text.indexOf(token);
  while (index !== -1) {
    if (index === 0 || URL_BOUNDARIES.includes(text[index - 1])) {
      return true;
    }
    index = text.indexOf(token, index + 1);
  }
  return false;
}

function tokenScore(token: string, candidate: HistoryCandidate): number {
  const url = displayUrl(candidate.url).toLowerCase();
  const title = candidate.title.toLowerCase();
  if (url.startsWith(token)) {
    return PREFIX_SCORE;
  }
  if (startsWord(url, token) || startsWord(title, token)) {
    return WORD_START_SCORE;
  }
  if (url.includes(token) || title.includes(token)) {
    return SUBSTRING_SCORE;
  }
  return 0;
}

export function candidateScore(
  query: string,
  candidate: HistoryCandidate,
): number {
  const matchScore = queryTokens(query)
    .reduce((sum, token) => sum + tokenScore(token, candidate), 0);
  let score = matchScore +
    candidate.inputUse * INPUT_USE_WEIGHT +
    Math.log2(candidate.visitCount + 1) * VISIT_WEIGHT;
  if (candidate.bookmarked) {
    score += BOOKMARK_SCORE;
  }
  return score;
}

// How well the worst-matching word matches: starts a part, merely contained,
// or not at all. Picked pages count as starting a part.
function matchTier(query: string, candidate: HistoryCandidate): number {
  if (isLearnedHit(candidate)) {
    return WORD_START_SCORE;
  }
  const scores = queryTokens(query).map((token) =>
    tokenScore(token, candidate)
  );
  return Math.min(WORD_START_SCORE, ...scores);
}

// Word-start matches always outrank pages that only contain the letters
// somewhere (`ibc` inside a tracking parameter), however often visited.
export function rankCandidates(
  query: string,
  candidates: HistoryCandidate[],
): HistoryCandidate[] {
  return candidates
    .map((candidate) => ({
      candidate,
      tier: matchTier(query, candidate),
      score: candidateScore(query, candidate),
    }))
    .sort((first, second) =>
      second.tier - first.tier || second.score - first.score
    )
    .map((entry) => entry.candidate);
}

// Picked for this input before.
export function isLearnedHit(candidate: HistoryCandidate): boolean {
  return candidate.inputUse >= INPUT_USE_THRESHOLD;
}

// Visited often, and every typed word starts the host, a path segment or a
// title word: `ibc` for github.com/ibcornelsen/ibc, not for …/public.
export function isFrequentHit(
  query: string,
  candidate: HistoryCandidate,
): boolean {
  if (candidate.visitCount < TOP_HIT_MIN_VISITS) {
    return false;
  }
  const tokens = queryTokens(query);
  return tokens.length > 0 &&
    tokens.every((token) => tokenScore(token, candidate) >= WORD_START_SCORE);
}

// What to append to `typed` so the input reads as `url`: only when `typed`
// is the start of the URL, with or without scheme and `www.`.
export function inlineCompletion(typed: string, url: string): string {
  if (!typed || /\s/.test(typed)) {
    return "";
  }
  const lowered = typed.toLowerCase();
  const forms = [url, withoutScheme(url), displayUrl(url)];
  const form = forms.find((candidate) =>
    candidate.length > typed.length &&
    candidate.toLowerCase().startsWith(lowered)
  );
  if (!form) {
    return "";
  }
  return form.slice(typed.length);
}
