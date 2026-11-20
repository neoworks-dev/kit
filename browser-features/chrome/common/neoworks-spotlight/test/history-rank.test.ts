// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assert,
  assertEquals,
  runTests,
  type TestCase,
} from "../../../test/utils/test_harness.ts";
import {
  inlineCompletion,
  isFrequentHit,
  isLearnedHit,
  rankCandidates,
} from "../history-rank.ts";
import type { HistoryCandidate } from "../types.ts";

function candidate(
  url: string,
  overrides: Partial<HistoryCandidate> = {},
): HistoryCandidate {
  return {
    url,
    title: "",
    bookmarked: false,
    visitCount: 1,
    inputUse: 0,
    ...overrides,
  };
}

const REPO = candidate("https://github.com/ibcornelsen/ibc", {
  visitCount: 100,
});

function testPathSegmentIsFrequentHit(): void {
  assert(
    isFrequentHit("ibc", REPO),
    "a word starting a path segment of a busy page is a top hit",
  );
}

function testMidWordIsNotFrequentHit(): void {
  const page = candidate("https://example.com/public", { visitCount: 100 });
  assert(
    !isFrequentHit("ubl", page),
    "letters inside a word don't make a top hit",
  );
}

function testRareVisitIsNotFrequentHit(): void {
  const page = candidate("https://github.com/ibcornelsen/ibc", {
    visitCount: 1,
  });
  assert(
    !isFrequentHit("ibc", page),
    "a page seen once doesn't beat the search row",
  );
}

function testEveryWordMustStartAPart(): void {
  assert(isFrequentHit("ibc git", REPO), "each word starts a part");
  assert(
    !isFrequentHit("ibc ithu", REPO),
    "one word mid-host fails the whole query",
  );
}

function testOnePickIsLearned(): void {
  assert(
    isLearnedHit(candidate("https://a.example/", { inputUse: 1 })),
    "one pick counts",
  );
  assert(!isLearnedHit(candidate("https://a.example/")), "no picks don't");
}

function testRankingPrefersPicksThenVisits(): void {
  const busy = candidate("https://ibc.example/", { visitCount: 50 });
  const picked = candidate("https://other.example/ibc", {
    visitCount: 2,
    inputUse: 3,
  });
  const rare = candidate("https://ibc.example/rare", { visitCount: 1 });
  const ranked = rankCandidates("ibc", [rare, busy, picked]);
  assertEquals(
    ranked.map((entry) => entry.url).join(" "),
    [picked.url, busy.url, rare.url].join(" "),
    "picks, then visits",
  );
}

function testCompletionSkipsSchemeAndWww(): void {
  assertEquals(
    inlineCompletion("git", "https://github.com/"),
    "hub.com/",
    "git",
  );
  assertEquals(
    inlineCompletion("Git", "https://www.github.com/"),
    "hub.com/",
    "Git",
  );
  assertEquals(
    inlineCompletion("www.git", "https://www.github.com/"),
    "hub.com/",
    "www.git",
  );
  assertEquals(
    inlineCompletion("https://git", "https://github.com/"),
    "hub.com/",
    "https://git",
  );
}

function testNoCompletionUnlessPrefix(): void {
  assertEquals(inlineCompletion("ibc", REPO.url), "", "ibc");
  assertEquals(
    inlineCompletion("github.com/ibcornelsen/ibc", REPO.url),
    "",
    "github.com/ibcornelsen/ibc",
  );
  assertEquals(
    inlineCompletion("git hub", "https://github.com/"),
    "",
    "git hub",
  );
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    {
      name: "path segment start is a frequent hit",
      fn: testPathSegmentIsFrequentHit,
    },
    {
      name: "mid-word match is not a frequent hit",
      fn: testMidWordIsNotFrequentHit,
    },
    {
      name: "rarely visited page is not a frequent hit",
      fn: testRareVisitIsNotFrequentHit,
    },
    { name: "every word must start a part", fn: testEveryWordMustStartAPart },
    { name: "one pick makes a learned hit", fn: testOnePickIsLearned },
    {
      name: "ranking prefers picks, then visits",
      fn: testRankingPrefersPicksThenVisits,
    },
    {
      name: "completion skips scheme and www",
      fn: testCompletionSkipsSchemeAndWww,
    },
    { name: "no completion unless prefix", fn: testNoCompletionUnlessPrefix },
  ];
  await runTests("history-rank.test.ts", tests);
}
