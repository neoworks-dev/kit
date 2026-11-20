// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import { findHintTargets } from "../NWLinkHints.ts";
import {
  assert,
  runTests,
  type TestCase,
} from "../../../chrome/test/utils/test_harness.ts";

const FIXTURE_STYLE = "position: fixed; z-index: 2147483646; width: 80px; height: 40px;";

function fixedButton(top: number, left: number): HTMLButtonElement {
  const button = document.createElement("button");
  button.style.cssText = `${FIXTURE_STYLE} top: ${top}px; left: ${left}px;`;
  return button;
}

function withFixture(run: (root: HTMLDivElement) => void): void {
  const root = document.createElement("div");
  root.setAttribute("data-test-root", "link-hints");
  document.documentElement.appendChild(root);
  try {
    run(root);
  } finally {
    root.remove();
  }
}

function testCoveredElementGetsNoHint(): void {
  withFixture((root) => {
    const covered = fixedButton(100, 100);
    // Later in the tree at the same z-index, so it paints on top.
    const cover = fixedButton(100, 100);
    root.append(covered, cover);
    const targets = findHintTargets(window);
    assert(!targets.includes(covered), "a fully covered element must not be hinted");
    assert(targets.includes(cover), "the element on top is hinted");
  });
}

function testPartlyCoveredElementKeepsItsHint(): void {
  withFixture((root) => {
    const partly = fixedButton(200, 100);
    const cover = fixedButton(200, 140);
    root.append(partly, cover);
    const targets = findHintTargets(window);
    assert(targets.includes(partly), "an element with a visible part stays hinted");
  });
}

function testContentInsideElementCounts(): void {
  withFixture((root) => {
    const button = fixedButton(300, 100);
    const icon = document.createElement("span");
    icon.style.cssText = "display: block; width: 80px; height: 40px;";
    button.appendChild(icon);
    root.appendChild(button);
    assert(findHintTargets(window).includes(button), "a button's own icon doesn't cover it");
  });
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    { name: "covered element gets no hint", fn: testCoveredElementGetsNoHint },
    { name: "partly covered element keeps its hint", fn: testPartlyCoveredElementKeepsItsHint },
    { name: "content inside the element counts", fn: testContentInsideElementCounts },
  ];
  await runTests("NWLinkHints.test.ts", tests);
}
