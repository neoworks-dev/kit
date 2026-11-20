// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assert,
  assertEquals,
  runTests,
  type TestCase,
} from "../../../test/utils/test_harness.ts";
import { tabbrowser } from "../../neoworks-sidebar/tabbrowser.ts";
import type { BrowserTab, NeoworksTabbrowser } from "../../neoworks-sidebar/types.ts";
import { isMirror } from "../mirrors.ts";

const SYNC_ID_KEY = "neoworksSyncId";
const TIMEOUT_MS = 10_000;

interface SyncTestWindow extends Window {
  gBrowser: NeoworksTabbrowser;
  delayedStartupPromise: Promise<void>;
  OpenBrowserWindow(): SyncTestWindow;
  SessionStore: { getCustomTabValue(tab: BrowserTab, key: string): string };
}

const browserWindow = window as unknown as SyncTestWindow;

function syncId(tab: BrowserTab): string {
  return browserWindow.SessionStore.getCustomTabValue(tab, SYNC_ID_KEY);
}

function liveTabs(gBrowser: NeoworksTabbrowser): BrowserTab[] {
  return gBrowser.tabs.filter((tab) => !tab.closing);
}

function order(gBrowser: NeoworksTabbrowser): string {
  return liveTabs(gBrowser).map(syncId).join(",");
}

async function waitFor(
  condition: () => boolean,
  what: string,
  detail: () => string = () => "",
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > TIMEOUT_MS) {
      throw new Error(`Timed out waiting for ${what} ${detail()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// Both windows' tabs, for failure messages: sync id, (m)irror or (H)older.
function describe(other: SyncTestWindow): string {
  const list = (gBrowser: NeoworksTabbrowser) =>
    liveTabs(gBrowser).map((tab) =>
      `${syncId(tab).slice(0, 4)}${isMirror(tab) ? "m" : "H"}`
    ).join(" ");
  return `this: ${list(tabbrowser())} | other: ${list(other.gBrowser)}`;
}

function inSync(other: SyncTestWindow): boolean {
  return order(other.gBrowser) === order(tabbrowser());
}

function instanceIn(gBrowser: NeoworksTabbrowser, tab: BrowserTab): BrowserTab | undefined {
  const id = syncId(tab);
  return liveTabs(gBrowser).find((candidate) => syncId(candidate) === id);
}

function withSecondWindow(
  test: (other: SyncTestWindow) => Promise<void>,
): () => Promise<void> {
  return async () => {
    const other = browserWindow.OpenBrowserWindow();
    try {
      await waitFor(() => Boolean(other.gBrowser && other.delayedStartupPromise), "the window");
      await other.delayedStartupPromise;
      await waitFor(
        () => inSync(other),
        "the new window to get this window's tabs",
        () => describe(other),
      );
      await test(other);
    } finally {
      other.close();
    }
  };
}

const sameTabs = withSecondWindow(async (other) => {
  assertEquals(order(other.gBrowser), order(tabbrowser()), "same tabs in the same order");
  const ownTab = liveTabs(other.gBrowser).at(-1);
  assert(ownTab, "the new window has its own new tab");
  assert(
    isMirror(instanceIn(tabbrowser(), ownTab) as BrowserTab),
    `this window mirrors it (${describe(other)})`,
  );
});

const openAndClose = withSecondWindow(async (other) => {
  const tab = tabbrowser().addTrustedTab("about:robots", {
    userContextId: 0,
    inBackground: true,
  });
  await waitFor(() => Boolean(instanceIn(other.gBrowser, tab)), "the tab in the other window");
  await waitFor(
    () => instanceIn(other.gBrowser, tab)?.label === tab.label,
    "the other window's tab to take the title",
  );
  const mirror = instanceIn(other.gBrowser, tab) as BrowserTab;
  other.gBrowser.removeTab(mirror, { animate: false });
  await waitFor(() => !tab.isConnected || tab.closing, "the tab to close here too");
});

const folders = withSecondWindow(async (other) => {
  const browser = tabbrowser();
  const open = () =>
    browser.addTrustedTab("about:blank", { userContextId: 0, inBackground: true });
  const tabs = [open(), open()];
  await waitFor(() => inSync(other), "the new tabs in the other window");
  const before = liveTabs(other.gBrowser).length;
  const folder = browser.addTabGroup(tabs, { label: "Synced", insertBefore: tabs[0] });
  try {
    await waitFor(
      () => other.gBrowser.tabGroups.some((group) => group.id === folder.id),
      "the folder in the other window",
    );
    const copy = other.gBrowser.tabGroups.find((group) => group.id === folder.id);
    assertEquals(copy?.label, "Synced", "the folder keeps its name");
    assertEquals(copy?.tabs.length, 2, "the folder has both tabs");
    assertEquals(liveTabs(other.gBrowser).length, before, "no tab went missing");
    assertEquals(order(other.gBrowser), order(browser), "same order with the folder");
  } finally {
    for (const tab of tabs) {
      browser.removeTab(tab, { animate: false });
    }
  }
});

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    { name: "a new window shows the same tabs", fn: sameTabs },
    { name: "tabs open and close in every window", fn: openAndClose },
    { name: "folders are created in every window", fn: folders },
  ];
  await runTests("windowSync.test.ts", tests);
}
