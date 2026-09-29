// SPDX-License-Identifier: MPL-2.0

const WORD_BOUNDARIES = " /.-_:";
const SHORT_TEXT_LENGTH = 20;

function isWordStart(text: string, index: number): boolean {
  return index === 0 || WORD_BOUNDARIES.includes(text[index - 1]);
}

// Case-insensitive subsequence score. Returns -1 when `query` is not a
// subsequence of `text`; higher is a better match. Consecutive characters and
// word starts score extra, shorter texts win ties.
export function fuzzyScore(query: string, text: string): number {
  const needle = query.toLowerCase();
  const haystack = text.toLowerCase();
  let score = 0;
  let cursor = 0;
  let previousIndex = -1;

  for (const character of needle) {
    const foundIndex = haystack.indexOf(character, cursor);
    if (foundIndex === -1) {
      return -1;
    }
    score += 1;
    if (foundIndex === previousIndex + 1) {
      score += 2;
    }
    if (isWordStart(haystack, foundIndex)) {
      score += 2;
    }
    previousIndex = foundIndex;
    cursor = foundIndex + 1;
  }

  return score + Math.max(0, SHORT_TEXT_LENGTH - haystack.length) * 0.1;
}

// Keeps items scoring >= 0, best first.
export function rankByScore<T>(items: T[], scoreOf: (item: T) => number): T[] {
  const scored = items.map((item) => ({ item, score: scoreOf(item) }));
  return scored
    .filter((entry) => entry.score >= 0)
    .sort((first, second) => second.score - first.score)
    .map((entry) => entry.item);
}
