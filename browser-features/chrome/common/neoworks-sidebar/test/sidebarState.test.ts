// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assert,
  assertEquals,
  runTests,
  type TestCase,
} from "../../../test/utils/test_harness.ts";
import {
  nextSidebarState,
  parseSidebarState,
  parseSidebarTogglePair,
  stateFromDocked,
  takesRoom,
} from "../sidebar-state-model.ts";

function testParseState(): void {
  assertEquals(parseSidebarState("hidden"), "hidden", "hidden");
  assertEquals(parseSidebarState("compact"), "compact", "compact");
  assertEquals(parseSidebarState("expanded"), "expanded", "expanded");
  assertEquals(parseSidebarState("docked"), "expanded", "unknown falls back");
  assertEquals(parseSidebarState(undefined), "expanded", "unset falls back");
}

function testParsePair(): void {
  assertEquals(
    parseSidebarTogglePair("compact-hidden"),
    "compact-hidden",
    "known pair",
  );
  assertEquals(
    parseSidebarTogglePair("hidden-compact"),
    "expanded-hidden",
    "unknown falls back",
  );
  assertEquals(
    parseSidebarTogglePair(""),
    "expanded-hidden",
    "empty falls back",
  );
}

function testToggleWithinPair(): void {
  assertEquals(
    nextSidebarState("expanded", "expanded-hidden"),
    "hidden",
    "expanded to hidden",
  );
  assertEquals(
    nextSidebarState("hidden", "expanded-hidden"),
    "expanded",
    "hidden to expanded",
  );
  assertEquals(
    nextSidebarState("expanded", "expanded-compact"),
    "compact",
    "expanded to compact",
  );
  assertEquals(
    nextSidebarState("compact", "expanded-compact"),
    "expanded",
    "compact to expanded",
  );
  assertEquals(
    nextSidebarState("compact", "compact-hidden"),
    "hidden",
    "compact to hidden",
  );
  assertEquals(
    nextSidebarState("hidden", "compact-hidden"),
    "compact",
    "hidden to compact",
  );
}

function testToggleFromOutsidePair(): void {
  assertEquals(
    nextSidebarState("compact", "expanded-hidden"),
    "expanded",
    "compact goes to the pair's first",
  );
  assertEquals(
    nextSidebarState("hidden", "expanded-compact"),
    "expanded",
    "hidden goes to the pair's first",
  );
  assertEquals(
    nextSidebarState("expanded", "compact-hidden"),
    "compact",
    "expanded goes to the pair's first",
  );
}

function testLegacyDocked(): void {
  assertEquals(stateFromDocked(true), "expanded", "docked was expanded");
  assertEquals(stateFromDocked(false), "hidden", "floating was hidden");
}

function testTakesRoom(): void {
  assert(takesRoom("expanded"), "expanded takes room");
  assert(takesRoom("compact"), "compact takes room");
  assert(!takesRoom("hidden"), "hidden floats over the page");
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    { name: "parseSidebarState falls back to expanded", fn: testParseState },
    {
      name: "parseSidebarTogglePair falls back to expanded-hidden",
      fn: testParsePair,
    },
    { name: "the shortcut switches within its pair", fn: testToggleWithinPair },
    {
      name: "the shortcut leaves a third state for the pair's first",
      fn: testToggleFromOutsidePair,
    },
    { name: "the old docked pref maps to a state", fn: testLegacyDocked },
    { name: "compact and expanded take room", fn: testTakesRoom },
  ];
  await runTests("sidebarState.test.ts", tests);
}
