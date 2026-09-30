// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assert,
  assertEquals,
  runTests,
  type TestCase,
} from "../../../test/utils/test_harness.ts";
import {
  moveFolderBy,
  moveFolderOnto,
  moveTabIntoFolder,
  moveTabToListEnd,
  tabListElements,
} from "../folder-actions.ts";
import { tabbrowser } from "../tabbrowser.ts";
import type { BrowserTab, BrowserTabGroup, TabListElement } from "../types.ts";

interface Fixture {
  first: BrowserTab;
  grouped: BrowserTab;
  last: BrowserTab;
  folder: BrowserTabGroup;
}

// Three loose tabs at the end of the list, the middle one in a folder.
function createFixture(): Fixture {
  const browser = tabbrowser();
  const openTab = () => browser.addTrustedTab("about:blank", { userContextId: 0 });
  const first = openTab();
  const grouped = openTab();
  const last = openTab();
  const folder = browser.addTabGroup([grouped], { label: "Test", insertBefore: grouped });
  return { first, grouped, last, folder };
}

function removeFixture(fixture: Fixture): void {
  for (const tab of [fixture.first, fixture.grouped, fixture.last]) {
    if (tab.isConnected) {
      tabbrowser().removeTab(tab, { animate: false });
    }
  }
}

function withFixture(test: (fixture: Fixture) => void): () => void {
  return () => {
    const fixture = createFixture();
    try {
      test(fixture);
    } finally {
      removeFixture(fixture);
    }
  };
}

// Compares the end of the tab list with `expected`, element by element.
function assertListEndsWith(expected: TabListElement[], message: string): void {
  const actual = tabListElements().slice(-expected.length);
  expected.forEach((element, position) => {
    assertEquals(actual[position], element, `${message} (position ${position})`);
  });
}

function testListShowsFolderOnce(fixture: Fixture): void {
  assertListEndsWith(
    [fixture.first, fixture.folder, fixture.last],
    "folder is one element between its neighbors",
  );
}

function testMoveFolderDown(fixture: Fixture): void {
  moveFolderBy(fixture.folder, 1);
  assertListEndsWith(
    [fixture.first, fixture.last, fixture.folder],
    "folder moved below the last tab",
  );
}

function testMoveFolderUp(fixture: Fixture): void {
  moveFolderBy(fixture.folder, -1);
  assertListEndsWith(
    [fixture.folder, fixture.first, fixture.last],
    "folder moved above the first tab",
  );
}

function testFolderDroppedOnTabBelow(fixture: Fixture): void {
  moveFolderOnto(fixture.folder, fixture.last);
  assertListEndsWith(
    [fixture.first, fixture.last, fixture.folder],
    "folder takes the place after the tab",
  );
}

function testTabJoinsFolder(fixture: Fixture): void {
  moveTabIntoFolder(fixture.last, fixture.folder);
  assertEquals(fixture.last.group, fixture.folder, "tab is in the folder");
}

function testLastFolderTabLeavesToListEnd(fixture: Fixture): void {
  moveTabIntoFolder(fixture.last, fixture.folder);
  moveTabToListEnd(fixture.last);
  assert(fixture.last.group === null, "tab left the folder");
  assertListEndsWith(
    [fixture.first, fixture.folder, fixture.last],
    "tab sits below the folder",
  );
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    { name: "list shows a folder once", fn: withFixture(testListShowsFolderOnce) },
    { name: "moveFolderBy moves down", fn: withFixture(testMoveFolderDown) },
    { name: "moveFolderBy moves up", fn: withFixture(testMoveFolderUp) },
    { name: "folder dropped on a tab below", fn: withFixture(testFolderDroppedOnTabBelow) },
    { name: "tab joins a folder", fn: withFixture(testTabJoinsFolder) },
    {
      name: "last folder tab leaves to the list end",
      fn: withFixture(testLastFolderTabLeavesToListEnd),
    },
  ];
  await runTests("folderActions.test.ts", tests);
}
