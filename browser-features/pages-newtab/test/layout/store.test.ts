// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  addWidget,
  defaultLayout,
  moveWidget,
  parseLayout,
  removeWidget,
  updateWidget,
} from "../../src/layout/store.ts";
import type { NewTabLayout } from "../../src/layout/types.ts";
import {
  assertEquals,
  runTests,
  type TestCase,
} from "../../../chrome/test/utils/test_harness.ts";

function layoutOf(...ids: string[]): NewTabLayout {
  return {
    version: 1,
    widgets: ids.map((id) => ({ id, type: "kit.clock", size: "full", settings: {} })),
  };
}

const ids = (layout: NewTabLayout) => layout.widgets.map((w) => w.id).join(",");

const tests: TestCase[] = [
  {
    name: "missing or unreadable pref gives the default layout",
    fn: () => {
      const fallback = JSON.stringify(defaultLayout());
      assertEquals(JSON.stringify(parseLayout(null)), fallback, "null");
      assertEquals(JSON.stringify(parseLayout("{not json")), fallback, "bad JSON");
      assertEquals(
        JSON.stringify(parseLayout('{"version":2,"widgets":[]}')),
        fallback,
        "unknown version",
      );
    },
  },
  {
    name: "an empty saved layout stays empty",
    fn: () => {
      assertEquals(parseLayout('{"version":1,"widgets":[]}').widgets.length, 0, "empty");
    },
  },
  {
    name: "malformed and duplicate widgets are dropped",
    fn: () => {
      const layout = parseLayout(JSON.stringify({
        version: 1,
        widgets: [
          { id: "a", type: "kit.clock", size: "small", settings: { hour12: true } },
          { id: "a", type: "kit.search" },
          { type: "kit.clock" },
          "nope",
          { id: "b", type: "third.party", size: "huge", settings: [] },
        ],
      }));
      assertEquals(ids(layout), "a,b", "kept ids");
      assertEquals(layout.widgets[0].settings.hour12, true, "settings kept");
      assertEquals(layout.widgets[1].size, "full", "unknown size falls back");
      assertEquals(Object.keys(layout.widgets[1].settings).length, 0, "bad settings reset");
    },
  },
  {
    name: "moving swaps neighbours and stops at the ends",
    fn: () => {
      const layout = layoutOf("a", "b", "c");
      assertEquals(ids(moveWidget(layout, "b", -1)), "b,a,c", "up");
      assertEquals(ids(moveWidget(layout, "b", 1)), "a,c,b", "down");
      assertEquals(moveWidget(layout, "a", -1), layout, "first can't move up");
      assertEquals(moveWidget(layout, "c", 1), layout, "last can't move down");
    },
  },
  {
    name: "added widgets get unique ids",
    fn: () => {
      let layout = layoutOf();
      layout = addWidget(layout, "kit.clock", "small");
      layout = addWidget(layout, "kit.clock", "small");
      assertEquals(ids(layout), "kit.clock-1,kit.clock-2", "ids");
      layout = removeWidget(layout, "kit.clock-1");
      layout = addWidget(layout, "kit.clock", "small");
      assertEquals(ids(layout), "kit.clock-2,kit.clock-1", "reuses free id");
    },
  },
  {
    name: "update changes only the given widget",
    fn: () => {
      const layout = updateWidget(layoutOf("a", "b"), "b", { size: "small" });
      assertEquals(layout.widgets[0].size, "full", "a unchanged");
      assertEquals(layout.widgets[1].size, "small", "b updated");
    },
  },
];

export async function runAllTests(): Promise<void> {
  await runTests("store.test.ts", tests);
}
