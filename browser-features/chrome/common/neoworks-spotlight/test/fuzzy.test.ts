// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assert,
  assertEquals,
  runTests,
  type TestCase,
} from "../../../test/utils/test_harness.ts";
import { fuzzyScore, rankByScore } from "../fuzzy.ts";

function testNonSubsequenceIsRejected(): void {
  assertEquals(fuzzyScore("xyz", "New Tab"), -1, "missing characters reject the match");
}

function testWordStartsBeatScatteredMatches(): void {
  const wordStart = fuzzyScore("nt", "New Tab");
  const scattered = fuzzyScore("nt", "Pinned content");
  assert(wordStart > scattered, "initials of words should outrank scattered letters");
}

function testConsecutiveCharactersScoreHigher(): void {
  const consecutive = fuzzyScore("rel", "Reload Tab");
  const spread = fuzzyScore("rel", "Reopen Closed Tab");
  assert(consecutive > spread, "consecutive characters should outrank spread ones");
}

function testRankByScoreSortsAndFilters(): void {
  const ranked = rankByScore(["b", "a", "c"], (item) => {
    if (item === "c") {
      return -1;
    }
    if (item === "a") {
      return 5;
    }
    return 1;
  });
  assertEquals(ranked.join(","), "a,b", "best first, negative scores dropped");
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    { name: "non-subsequence is rejected", fn: testNonSubsequenceIsRejected },
    { name: "word starts beat scattered matches", fn: testWordStartsBeatScatteredMatches },
    { name: "consecutive characters score higher", fn: testConsecutiveCharactersScoreHigher },
    { name: "rankByScore sorts and filters", fn: testRankByScoreSortsAndFilters },
  ];
  await runTests("fuzzy.test.ts", tests);
}
