// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assertEquals,
  runTests,
  type TestCase,
} from "../../../test/utils/test_harness.ts";
import type { Workspace } from "../types.ts";
import { cycleIndex, parseWorkspaces } from "../workspace-model.ts";

const FALLBACK: Workspace[] = [
  { id: "default", name: "Default", color: "blue", userContextId: 0 },
];

function testValidListIsParsed(): void {
  const stored = [{ id: "a", name: "Work", color: "green", userContextId: 7 }];
  const parsed = parseWorkspaces(JSON.stringify(stored), FALLBACK);
  assertEquals(parsed.length, 1, "one stored workspace");
  assertEquals(parsed[0].userContextId, 7, "keeps the container id");
}

function testMalformedJsonFallsBack(): void {
  assertEquals(parseWorkspaces("{not json", FALLBACK), FALLBACK, "malformed JSON");
}

function testEmptyListFallsBack(): void {
  assertEquals(parseWorkspaces("[]", FALLBACK), FALLBACK, "empty list");
}

function testInvalidEntryFallsBack(): void {
  const stored = [{ id: "a", name: "Work", color: "green" }];
  assertEquals(
    parseWorkspaces(JSON.stringify(stored), FALLBACK),
    FALLBACK,
    "entry without a container id",
  );
}

function testCycleIndexWraps(): void {
  assertEquals(cycleIndex(2, 1, 3), 0, "next wraps from last to first");
  assertEquals(cycleIndex(0, -1, 3), 2, "previous wraps from first to last");
  assertEquals(cycleIndex(1, 1, 3), 2, "next moves forward");
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    { name: "valid list is parsed", fn: testValidListIsParsed },
    { name: "malformed JSON falls back", fn: testMalformedJsonFallsBack },
    { name: "empty list falls back", fn: testEmptyListFallsBack },
    { name: "invalid entry falls back", fn: testInvalidEntryFallsBack },
    { name: "cycleIndex wraps", fn: testCycleIndexWraps },
  ];
  await runTests("workspaceModel.test.ts", tests);
}
