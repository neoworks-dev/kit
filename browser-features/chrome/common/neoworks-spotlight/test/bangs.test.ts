// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assert,
  assertEquals,
  runTests,
  type TestCase,
} from "../../../test/utils/test_harness.ts";
import {
  BANG_FORMAT,
  bangsStartingWith,
  bangUrl,
  buildBangIndex,
  parseBangQuery,
} from "../bangs.ts";
import type { BangEntry } from "../types.ts";

const YOUTUBE: BangEntry = {
  name: "YouTube",
  domain: "www.youtube.com",
  triggers: ["yt", "youtube"],
  url: "https://www.youtube.com/results?search_query={{{s}}}",
};

const YAHOO: BangEntry = {
  name: "Yahoo",
  domain: "search.yahoo.com",
  triggers: ["y", "yahoo"],
  url: "https://search.yahoo.com/search?p={{{s}}}",
};

function testBangAtStart(): void {
  const bang = parseBangQuery("!yt lofi beats");
  assertEquals(bang?.trigger, "yt", "trigger");
  assertEquals(bang?.terms, "lofi beats", "terms");
}

function testBangAtEndAndMiddle(): void {
  assertEquals(
    parseBangQuery("lofi beats !YT")?.trigger,
    "yt",
    "trailing bang, any case",
  );
  assertEquals(
    parseBangQuery("lofi !yt beats")?.terms,
    "lofi beats",
    "middle bang leaves the rest",
  );
}

function testExclamationInsideWordIsNoBang(): void {
  assertEquals(parseBangQuery("hello!yt"), null, "a bang starts a word");
}

function testBangAloneHasNoTerms(): void {
  assertEquals(parseBangQuery("!yt")?.terms, "", "no terms");
}

function testTermsAreEncoded(): void {
  assertEquals(
    bangUrl(YOUTUBE, "rock & roll"),
    "https://www.youtube.com/results?search_query=rock+%26+roll",
    "Kagi's default: encoded, spaces as plus",
  );
  const raw: BangEntry = { ...YOUTUBE, formats: BANG_FORMAT.openBasePath };
  assertEquals(
    bangUrl(raw, "a b"),
    "https://www.youtube.com/results?search_query=a b",
    "formats without encoding keep the terms",
  );
}

function testBangAloneOpensSite(): void {
  assertEquals(
    bangUrl(YOUTUBE, ""),
    "https://www.youtube.com/results",
    "base path by default",
  );
  const snap: BangEntry = { ...YOUTUBE, formats: BANG_FORMAT.openSnapDomain };
  assertEquals(
    bangUrl(snap, ""),
    "https://www.youtube.com/",
    "snap to the domain",
  );
}

function testKitTriggerOverridesKagi(): void {
  const index = buildBangIndex([YAHOO, YOUTUBE]);
  assertEquals(index.get("y")?.name, "YouTube", "!y is YouTube in Kit");
  assertEquals(index.get("yahoo")?.name, "Yahoo", "other triggers stay");
}

function testPrefixMatchesShortestFirstOncePerSite(): void {
  const index = buildBangIndex([YAHOO, YOUTUBE]);
  const matches = bangsStartingWith(index, "y", 5);
  assertEquals(matches[0].trigger, "y", "exact trigger first");
  const sites = matches.map(({ entry }) => entry.name);
  assert(new Set(sites).size === sites.length, "each site once");
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    { name: "bang at start", fn: testBangAtStart },
    { name: "bang at end and middle", fn: testBangAtEndAndMiddle },
    {
      name: "! inside a word is no bang",
      fn: testExclamationInsideWordIsNoBang,
    },
    { name: "bang alone has no terms", fn: testBangAloneHasNoTerms },
    { name: "terms are encoded per format", fn: testTermsAreEncoded },
    { name: "bang alone opens the site", fn: testBangAloneOpensSite },
    { name: "Kit trigger overrides Kagi", fn: testKitTriggerOverridesKagi },
    {
      name: "prefix matches shortest first, once per site",
      fn: testPrefixMatchesShortestFirstOncePerSite,
    },
  ];
  await runTests("bangs.test.ts", tests);
}
