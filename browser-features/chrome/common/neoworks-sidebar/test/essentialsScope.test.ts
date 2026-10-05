// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assert,
  assertEquals,
  runTests,
  type TestCase,
} from "../../../test/utils/test_harness.ts";
import {
  essentialOrphaned,
  essentialScope,
  parseEssentialsScope,
} from "../essentials-scope.ts";

const WORK = { id: "work", userContextId: 3 };
const HOME = { id: "home", userContextId: 0 };
const SIBLING = { id: "sibling", userContextId: 3 };
const TAG = { workspaceId: "work", containerId: "3" };

function testSharedAlwaysBelongs(): void {
  assert(essentialScope(TAG, HOME, "shared"), "shared shows everywhere");
}

function testWorkspaceScope(): void {
  assert(essentialScope(TAG, WORK, "workspace"), "shows in its workspace");
  assert(!essentialScope(TAG, SIBLING, "workspace"), "hidden elsewhere, even in the same container");
}

function testContainerScope(): void {
  assert(essentialScope(TAG, SIBLING, "container"), "shows in a workspace with the container");
  assert(!essentialScope(TAG, HOME, "container"), "hidden in another container");
  const home = { workspaceId: "home", containerId: "0" };
  assert(essentialScope(home, HOME, "container"), "no container counts as one");
}

function testUntaggedBelongsEverywhere(): void {
  const legacy = { workspaceId: "", containerId: "" };
  assert(essentialScope(legacy, HOME, "workspace"), "legacy in workspace mode");
  assert(essentialScope(legacy, WORK, "container"), "legacy in container mode");
}

function testParseScope(): void {
  assertEquals(parseEssentialsScope("workspace"), "workspace", "workspace");
  assertEquals(parseEssentialsScope("container"), "container", "container");
  assertEquals(parseEssentialsScope("nonsense"), "shared", "unknown falls back");
  assertEquals(parseEssentialsScope(undefined), "shared", "unset falls back");
}

function testOrphaned(): void {
  assert(essentialOrphaned(TAG, WORK, [HOME], "workspace"), "workspace mode closes its own");
  assert(!essentialOrphaned(TAG, HOME, [WORK], "workspace"), "other workspace's stay");
  assert(essentialOrphaned(TAG, WORK, [HOME], "container"), "last workspace of the container");
  assert(!essentialOrphaned(TAG, WORK, [HOME, SIBLING], "container"), "container still in use");
  assert(!essentialOrphaned(TAG, WORK, [HOME], "shared"), "shared never closes");
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    { name: "shared belongs everywhere", fn: testSharedAlwaysBelongs },
    { name: "workspace scope compares workspace ids", fn: testWorkspaceScope },
    { name: "container scope compares containers", fn: testContainerScope },
    { name: "untagged essentials belong everywhere", fn: testUntaggedBelongsEverywhere },
    { name: "parseEssentialsScope falls back to shared", fn: testParseScope },
    { name: "essentialOrphaned follows the scope", fn: testOrphaned },
  ];
  await runTests("essentialsScope.test.ts", tests);
}
