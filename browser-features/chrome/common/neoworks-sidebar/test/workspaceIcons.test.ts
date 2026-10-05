// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assert,
  assertEquals,
  runTests,
  type TestCase,
} from "../../../test/utils/test_harness.ts";
import {
  importedWorkspaceIcon,
  isEmojiIcon,
  WORKSPACE_ICONS,
} from "../workspace-icons.ts";

const tests: TestCase[] = [
  {
    name: "emoji stay emoji",
    fn: () => {
      assert(isEmojiIcon("🚀"), "emoji detected");
      assert(!isEmojiIcon("rocket"), "icon names are not emoji");
      assertEquals(importedWorkspaceIcon("🚀"), "🚀", "importedWorkspaceIcon(🚀), 🚀");
    },
  },
  {
    name: "Zen icon names map to Kit icons",
    fn: () => {
      assertEquals(importedWorkspaceIcon("home"), "house", "importedWorkspaceIcon(home), house");
      assertEquals(importedWorkspaceIcon("rocket"), "rocket", "importedWorkspaceIcon(rocket), rocket");
    },
  },
  {
    name: "unknown or missing icons fall back to the first icon",
    fn: () => {
      assertEquals(importedWorkspaceIcon("no-such-icon"), WORKSPACE_ICONS[0], "importedWorkspaceIcon(no-such-icon), WORKSPACE_ICO");
      assertEquals(importedWorkspaceIcon(undefined), WORKSPACE_ICONS[0], "importedWorkspaceIcon(undefined), WORKSPACE_ICONS[");
    },
  },
];

export async function runAllTests(): Promise<void> {
  await runTests("workspaceIcons.test.ts", tests);
}
