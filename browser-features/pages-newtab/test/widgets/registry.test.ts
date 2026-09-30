// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  defineWidget,
  getWidget,
  listWidgets,
  registerWidget,
} from "../../src/widgets/registry.ts";
import {
  assert,
  assertEquals,
  assertThrows,
  runTests,
  type TestCase,
} from "../../../chrome/test/utils/test_harness.ts";

function testWidget(type: string) {
  return defineWidget<{ on: boolean }>({
    type,
    title: type,
    description: "",
    sizes: ["small", "full"],
    defaultSize: "small",
    defaultSettings: { on: false },
    component: () => null,
  });
}

const tests: TestCase[] = [
  {
    name: "register and unregister",
    fn: () => {
      const unregister = registerWidget(testWidget("test.a"));
      assert(getWidget("test.a"), "registered");
      assert(listWidgets().some((d) => d.type === "test.a"), "listed");
      unregister();
      assertEquals(getWidget("test.a"), undefined, "unregistered");
    },
  },
  {
    name: "a type can only be registered once",
    fn: () => {
      const unregister = registerWidget(testWidget("test.b"));
      assertThrows(() => registerWidget(testWidget("test.b")), "duplicate");
      unregister();
    },
  },
  {
    name: "unregistering twice leaves a re-registered type alone",
    fn: () => {
      const unregister = registerWidget(testWidget("test.c"));
      unregister();
      const again = registerWidget(testWidget("test.c"));
      unregister();
      assert(getWidget("test.c"), "still registered");
      again();
    },
  },
  {
    name: "the default size must be allowed",
    fn: () => {
      const widget = { ...testWidget("test.d"), defaultSize: "medium" as const };
      assertThrows(() => registerWidget(widget), "bad default size");
    },
  },
];

export async function runAllTests(): Promise<void> {
  await runTests("registry.test.ts", tests);
}
