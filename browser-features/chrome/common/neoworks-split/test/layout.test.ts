// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assert,
  assertEquals,
  runTests,
  type TestCase,
} from "../../../test/utils/test_harness.ts";
import {
  insertAtDivider,
  insertPane,
  layoutSplit,
  nearestSide,
  pane,
  panesOf,
  removePane,
  resizeDivider,
  syncPanes,
} from "../layout.ts";
import type { SplitNode } from "../types.ts";

const BOUNDS = { x: 0, y: 0, width: 1008, height: 600 };

function sizesOf(node: SplitNode<string> | null): number[] {
  if (!node || node.kind !== "split") {
    return [];
  }
  return node.sizes.map((size) => Math.round(size * 1000) / 1000);
}

function testSplitRight(): void {
  const root = insertPane(pane("a"), "a", "b", "right");
  assertEquals(panesOf(root).join(), "a,b", "b goes right of a");
  const layout = layoutSplit(root, BOUNDS, 8);
  assertEquals(layout.panes[0].rect.width, 500, "halves minus the gap");
  assertEquals(layout.panes[1].rect.x, 508, "second pane after the gap");
  assertEquals(layout.dividers.length, 1, "one divider");
  assertEquals(layout.dividers[0].rect.x, 500, "divider sits in the gap");
}

function testSameDirectionJoinsSplit(): void {
  let root = insertPane(pane("a"), "a", "b", "right");
  root = insertPane(root, "b", "c", "right");
  assert(root.kind === "split" && root.children.length === 3, "three panes in one row");
  assertEquals(sizesOf(root).join(), "0.5,0.25,0.25", "b's half is shared with c");
}

function testCrossDirectionNests(): void {
  let root = insertPane(pane("a"), "a", "b", "right");
  root = insertPane(root, "b", "c", "top");
  assertEquals(panesOf(root).join(), "a,c,b", "c above b");
  const layout = layoutSplit(root, BOUNDS, 8);
  const c = layout.panes.find((entry) => entry.item === "c");
  assertEquals(c?.rect.height, 296, "c takes the top half of b's column");
  assertEquals(layout.dividers.length, 2, "row divider and column divider");
}

function testInsertAtDivider(): void {
  const root = insertAtDivider(insertPane(pane("a"), "a", "b", "right"), [], 0, "c");
  assertEquals(panesOf(root).join(), "a,c,b", "c between a and b");
  assertEquals(sizesOf(root).join(), "0.333,0.333,0.333", "a third each");
}

function testRemoveCollapses(): void {
  let root: SplitNode<string> | null = insertPane(pane("a"), "a", "b", "right");
  root = insertPane(root, "b", "c", "bottom");
  root = removePane(root, "c");
  assert(root?.kind === "split" && root.direction === "row", "back to one row");
  assertEquals(panesOf(root as SplitNode<string>).join(), "a,b", "a and b remain");
  assertEquals(removePane(pane("a"), "a"), null, "last pane leaves nothing");
}

function testResizeClamps(): void {
  const root = insertPane(pane("a"), "a", "b", "right");
  assertEquals(sizesOf(resizeDivider(root, [], 0, 0.2, 0.1)).join(), "0.7,0.3", "moves");
  assertEquals(sizesOf(resizeDivider(root, [], 0, 0.9, 0.1)).join(), "0.9,0.1", "clamped");
}

function testSync(): void {
  const root = syncPanes(insertPane(pane("a"), "a", "b", "bottom"), ["b", "c"]);
  assertEquals(panesOf(root as SplitNode<string>).join(), "b,c", "a dropped, c added");
}

function testNearestSide(): void {
  assertEquals(nearestSide(BOUNDS, 50, 300), "left", "near the left edge");
  assertEquals(nearestSide(BOUNDS, 500, 590), "bottom", "near the bottom edge");
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    { name: "split right halves the pane", fn: testSplitRight },
    { name: "same direction joins the split", fn: testSameDirectionJoinsSplit },
    { name: "other direction nests", fn: testCrossDirectionNests },
    { name: "insert at a divider", fn: testInsertAtDivider },
    { name: "removing collapses splits", fn: testRemoveCollapses },
    { name: "resizing clamps", fn: testResizeClamps },
    { name: "sync with the split's tabs", fn: testSync },
    { name: "nearest side", fn: testNearestSide },
  ];
  await runTests("layout.test.ts", tests);
}
