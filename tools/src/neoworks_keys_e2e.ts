// SPDX-License-Identifier: MPL-2.0

// End-to-end checks for the Neoworks keyboard layer (NWKeys actor, chrome key
// listener, commands). Needs a running dev browser (`deno task feles-build dev`).
// Run with:
//   deno run -A tools/src/neoworks_keys_e2e.ts

import { MarionetteClient } from "./browser_connector.ts";

const SPOTLIGHT_ID = "neoworks-spotlight";
const SPOTLIGHT_INPUT_ID = "neoworks-spotlight-input";
const WAIT_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 50;
const QUICKMARKS_PREF = "neoworks.quickmarks";
// WebDriver code points for keys without a printable character: Shift is
// U+E008, Escape is U+E00C (both render invisibly in most editors).
const SHIFT_KEY = "";
const ESCAPE_KEY = "";
const LONE_SPACE_SETTLE_MS = 500;

function fixturePage(title: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>${title}</title>
<input id="field">
<a id="link" href="/linked">Linked page</a>
<div style="height: 4000px">${title}</div>`;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function extractHandle(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  const record = value as { handle?: string; value?: string };
  if (record.handle) {
    return record.handle;
  }
  if (record.value) {
    return record.value;
  }
  throw new Error(`Unexpected window handle: ${JSON.stringify(value)}`);
}

function startFixtureServer(): Deno.HttpServer<Deno.NetAddr> {
  return Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, (request) => {
    const title = new URL(request.url).pathname;
    return new Response(fixturePage(title), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });
}

class KeysTestContext {
  constructor(
    readonly client: MarionetteClient,
    readonly baseUrl: string,
    readonly testTabHandle: string,
  ) {}

  pressKeys(keys: string[]): Promise<void> {
    return this.performKeyActions(keys.flatMap((key) => [
      { type: "keyDown", value: key },
      { type: "keyUp", value: key },
    ]));
  }

  // Holds Shift as its own key, like a real keyboard (Shift keydown first).
  pressShifted(key: string): Promise<void> {
    return this.performKeyActions([
      { type: "keyDown", value: SHIFT_KEY },
      { type: "keyDown", value: key },
      { type: "keyUp", value: key },
      { type: "keyUp", value: SHIFT_KEY },
    ]);
  }

  private async performKeyActions(actions: { type: string; value: string }[]): Promise<void> {
    await this.client.send("WebDriver:PerformActions", {
      actions: [{ type: "key", id: "neoworks-keyboard", actions }],
    });
    await this.client.send("WebDriver:ReleaseActions", {});
  }

  async inChrome<T>(script: string): Promise<T> {
    await this.client.setContext("chrome");
    try {
      return await this.client.executeScript(script) as T;
    } finally {
      await this.client.setContext("content");
    }
  }

  inPage<T>(script: string): Promise<T> {
    return this.client.executeScript(script) as Promise<T>;
  }

  async waitFor(check: () => Promise<boolean>, message: string): Promise<void> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await check()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(message);
  }

  async loadFixture(path: string): Promise<void> {
    await this.client.navigate(this.baseUrl + path);
    await this.focusPage();
  }

  // Commands only run for the selected tab, so every test starts by selecting
  // the test tab again.
  async focusPage(): Promise<void> {
    await this.client.send("WebDriver:SwitchToWindow", {
      handle: this.testTabHandle,
      focus: true,
    });
    await this.inChrome("gBrowser.selectedBrowser.focus();");
    await this.inPage("document.activeElement?.blur(); window.focus();");
  }

  isSpotlightOpen(): Promise<boolean> {
    return this.inChrome<boolean>(
      `return document.getElementById(${JSON.stringify(SPOTLIGHT_ID)})?.hasAttribute("data-open") === true;`,
    );
  }

  async closeSpotlight(): Promise<void> {
    await this.inChrome(`
      const input = document.getElementById(${JSON.stringify(SPOTLIGHT_INPUT_ID)});
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    `);
  }

  scrollY(): Promise<number> {
    return this.inPage<number>("return window.scrollY;");
  }

  selectedTabIndex(): Promise<number> {
    return this.inChrome<number>("return gBrowser.tabs.indexOf(gBrowser.selectedTab);");
  }

  // Scripts run mid-navigation return null; treat that as "not there yet".
  async pageUrl(): Promise<string> {
    const url = await this.inPage<string | null>("return location.href;");
    if (typeof url !== "string") {
      return "";
    }
    return url;
  }
}

async function testDoubleSpaceOpensSpotlight(context: KeysTestContext): Promise<void> {
  await context.focusPage();
  await context.pressKeys([" ", " "]);
  await context.waitFor(
    () => context.isSpotlightOpen(),
    "Double Space on a page did not open the spotlight",
  );
  await context.closeSpotlight();
  assert(!(await context.isSpotlightOpen()), "Escape did not close the spotlight");
}

async function testDoubleSpaceInInputTypesSpaces(context: KeysTestContext): Promise<void> {
  await context.inPage(`
    const field = document.getElementById("field");
    field.value = "";
    field.focus();
  `);
  await context.pressKeys([" ", " ", "j"]);
  const value = await context.inPage<string>(`return document.getElementById("field").value;`);
  assert(value === "  j", `Input should contain "  j", got ${JSON.stringify(value)}`);
  assert(!(await context.isSpotlightOpen()), "Double Space inside an input opened the spotlight");
}

function spotlightTitles(context: KeysTestContext): Promise<string[]> {
  return context.inChrome<string[]>(`
    const rows = document.querySelectorAll("#neoworks-spotlight .nw-spotlight-title");
    return Array.from(rows, (row) => row.textContent);
  `);
}

async function testSpotlightRunsCommands(context: KeysTestContext): Promise<void> {
  await context.loadFixture("/spotlight-command");
  await context.pressKeys(["o"]);
  await context.waitFor(() => context.isSpotlightOpen(), "o did not open the spotlight");
  const initialTitles = await spotlightTitles(context);
  assert(initialTitles.includes("New Tab"), "Empty spotlight should list commands");

  await context.client.setContext("chrome");
  await context.pressKeys("to bottom".split(""));
  await context.client.setContext("content");
  await context.waitFor(
    async () => (await spotlightTitles(context)).includes("Scroll to Bottom"),
    "Typing did not surface the Scroll to Bottom command",
  );
  await context.inChrome(`
    const rows = document.querySelectorAll("#neoworks-spotlight .nw-spotlight-result");
    const row = Array.from(rows).find((candidate) =>
      candidate.querySelector(".nw-spotlight-title").textContent === "Scroll to Bottom");
    row.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  `);
  assert(!(await context.isSpotlightOpen()), "Running a command should close the spotlight");
  await context.waitFor(
    async () => (await context.scrollY()) > 2000,
    "Scroll to Bottom from the spotlight did not scroll the page",
  );
}

async function testScrollKeys(context: KeysTestContext): Promise<void> {
  await context.loadFixture("/scroll");
  await context.pressKeys(["j"]);
  await context.waitFor(async () => (await context.scrollY()) > 0, "j did not scroll down");
  await context.pressKeys(["G"]);
  await context.waitFor(async () => (await context.scrollY()) > 2000, "G did not scroll to bottom");
  await context.pressKeys(["g", "g"]);
  await context.waitFor(async () => (await context.scrollY()) === 0, "gg did not scroll to top");
}

async function testLoneSpaceDoesNotScroll(context: KeysTestContext): Promise<void> {
  await context.loadFixture("/lone-space");
  await context.pressKeys([" "]);
  await new Promise((resolve) => setTimeout(resolve, LONE_SPACE_SETTLE_MS));
  assert((await context.scrollY()) === 0, "A single Space scrolled the page");
  assert(!(await context.isSpotlightOpen()), "A single Space opened the spotlight");
}

// Marionette keeps sending page keys to the test tab even after it goes to the
// background, so the second key is pressed with focus in the browser chrome.
async function testTabSwitchKeys(context: KeysTestContext): Promise<void> {
  await context.focusPage();
  const startIndex = await context.selectedTabIndex();
  await context.pressKeys(["K"]);
  await context.waitFor(
    async () => (await context.selectedTabIndex()) !== startIndex,
    "K did not switch to the previous tab",
  );
  await focusSidebar(context);
  await context.client.setContext("chrome");
  await context.pressKeys(["J"]);
  await context.client.setContext("content");
  await context.waitFor(
    async () => (await context.selectedTabIndex()) === startIndex,
    "J did not switch back to the next tab",
  );
}

// Real keyboards send a separate Shift keydown between g and T.
async function testShiftedSequence(context: KeysTestContext): Promise<void> {
  await context.focusPage();
  const startIndex = await context.selectedTabIndex();
  await context.pressKeys(["g"]);
  await context.pressShifted("T");
  await context.waitFor(
    async () => (await context.selectedTabIndex()) !== startIndex,
    "g Shift+T did not switch to the previous tab",
  );
}

async function testWhichKeyOverlay(context: KeysTestContext): Promise<void> {
  await context.loadFixture("/which-key");
  const isOverlayOpen = () =>
    context.inChrome<boolean>(
      `return document.getElementById("neoworks-which-key")?.hasAttribute("data-open") === true;`,
    );
  await context.pressKeys(["g"]);
  await context.waitFor(isOverlayOpen, "Pending g did not show the which-key overlay");
  await context.pressKeys([ESCAPE_KEY]);
  await context.waitFor(async () => !(await isOverlayOpen()), "Escape did not hide which-key");

  await context.pressKeys(["g"]);
  await context.waitFor(isOverlayOpen, "Second pending g did not show which-key");
  await context.pressKeys(["g"]);
  await context.waitFor(
    async () => !(await isOverlayOpen()),
    "Completing gg did not hide which-key",
  );
}

async function testSidebarPeeksOnTabSwitch(context: KeysTestContext): Promise<void> {
  await context.focusPage();
  const isSidebarVisible = () =>
    context.inChrome<boolean>(
      `return document.getElementById("neoworks-sidebar")?.hasAttribute("data-visible") === true;`,
    );
  await context.pressKeys(["J"]);
  await context.waitFor(isSidebarVisible, "J did not slide the sidebar in");
  await context.waitFor(async () => !(await isSidebarVisible()), "Sidebar did not hide again");
}

async function testQuickmarks(context: KeysTestContext): Promise<void> {
  await context.inChrome(`Services.prefs.clearUserPref(${JSON.stringify(QUICKMARKS_PREF)});`);
  await context.loadFixture("/marked");
  await context.pressKeys(["m", "q"]);
  await context.loadFixture("/elsewhere");
  // German layouts type ' as Shift+#, so a Shift keydown lands inside the
  // sequence. (WebDriver maps Shift+' to ", so Shift is pressed on its own.)
  await context.pressKeys(["'", SHIFT_KEY, "q"]);
  await context.waitFor(
    async () => (await context.pageUrl()).endsWith("/marked"),
    "'q did not return to the quickmarked page",
  );
  await context.inChrome(`Services.prefs.clearUserPref(${JSON.stringify(QUICKMARKS_PREF)});`);
}

async function linkHintLabel(context: KeysTestContext): Promise<string> {
  return await context.inPage<string>(`
    const link = document.getElementById("link").getBoundingClientRect();
    const badges = document.querySelectorAll("[data-neoworks-hints] > div");
    for (const badge of badges) {
      if (Math.abs(parseFloat(badge.style.left) - Math.max(0, link.left)) < 1 &&
          Math.abs(parseFloat(badge.style.top) - Math.max(0, link.top)) < 1) {
        return badge.textContent;
      }
    }
    return "";
  `);
}

async function testLinkHints(context: KeysTestContext): Promise<void> {
  await context.loadFixture("/hints");
  await context.pressKeys(["f"]);
  await context.waitFor(
    () => context.inPage<boolean>(`return !!document.querySelector("[data-neoworks-hints]");`),
    "f did not show link hints",
  );
  const label = await linkHintLabel(context);
  assert(label.length > 0, "No hint label found for the link");
  await context.pressKeys(label.split(""));
  await context.waitFor(
    async () => (await context.pageUrl()).endsWith("/linked"),
    `Typing hint "${label}" did not follow the link`,
  );
}

function tabCount(context: KeysTestContext): Promise<number> {
  return context.inChrome<number>("return gBrowser.tabs.length;");
}

async function testBackgroundLinkHints(context: KeysTestContext): Promise<void> {
  await context.loadFixture("/background-hints");
  const tabsBefore = await tabCount(context);
  const selectedBefore = await context.selectedTabIndex();
  await context.pressKeys(["F"]);
  const label = await linkHintLabel(context);
  assert(label.length > 0, "No hint label found for the link");
  await context.pressKeys(label.split(""));
  await context.waitFor(
    async () => (await tabCount(context)) === tabsBefore + 1,
    "F did not open the link in a new tab",
  );
  assert(
    (await context.selectedTabIndex()) === selectedBefore,
    "F should keep the current tab selected",
  );
  await context.inChrome(`
    const opened = gBrowser.tabs.find((tab) =>
      tab.linkedBrowser.currentURI.spec.endsWith("/linked") && !tab.selected);
    if (opened) gBrowser.removeTab(opened);
  `);
}

// `t` selects the new tab, so `x` is pressed with focus in the browser chrome
// (Marionette still targets the original tab).
async function testNewAndCloseTab(context: KeysTestContext): Promise<void> {
  await context.focusPage();
  const tabsBefore = await tabCount(context);
  await context.pressKeys(["t"]);
  await context.waitFor(
    async () => (await tabCount(context)) === tabsBefore + 1,
    "t did not open a new tab",
  );
  await focusSidebar(context);
  await context.client.setContext("chrome");
  await context.pressKeys(["x"]);
  await context.client.setContext("content");
  await context.waitFor(
    async () => (await tabCount(context)) === tabsBefore,
    "x did not close the new tab",
  );
}

async function focusSidebar(context: KeysTestContext): Promise<void> {
  await context.inChrome(`
    const sidebar = document.getElementById("neoworks-sidebar");
    sidebar.setAttribute("tabindex", "-1");
    sidebar.focus();
  `);
  const focusInChrome = await context.inChrome<boolean>(
    `return document.activeElement?.id === "neoworks-sidebar";`,
  );
  assert(focusInChrome, "Could not move focus into the sidebar");
}

async function testChromeFocusKeys(context: KeysTestContext): Promise<void> {
  await context.loadFixture("/chrome-focus");
  await focusSidebar(context);
  await context.client.setContext("chrome");
  await context.pressKeys(["j"]);
  await context.client.setContext("content");
  await context.waitFor(
    async () => (await context.scrollY()) > 0,
    "j with focus in the sidebar did not scroll the page",
  );
}

const TESTS: Array<[string, (context: KeysTestContext) => Promise<void>]> = [
  ["double Space opens spotlight", testDoubleSpaceOpensSpotlight],
  ["keys typed into inputs stay text", testDoubleSpaceInInputTypesSpaces],
  ["spotlight lists, filters and runs commands", testSpotlightRunsCommands],
  ["j / G / gg scroll the page", testScrollKeys],
  ["single Space neither scrolls nor opens spotlight", testLoneSpaceDoesNotScroll],
  ["K / J switch tabs", testTabSwitchKeys],
  ["g Shift+T switches tabs", testShiftedSequence],
  ["which-key overlay shows pending keys", testWhichKeyOverlay],
  ["sidebar slides in on J and hides again", testSidebarPeeksOnTabSwitch],
  ["m<letter> and '<letter> quickmarks (Shift in between)", testQuickmarks],
  ["f link hints follow a link", testLinkHints],
  ["F link hints open a background tab", testBackgroundLinkHints],
  ["t opens and x closes a tab", testNewAndCloseTab],
  ["keys work with focus in the sidebar", testChromeFocusKeys],
];

async function runAll(context: KeysTestContext): Promise<boolean> {
  let failed = false;
  for (const [name, run] of TESTS) {
    try {
      await run(context);
      console.log(`PASS ${name}`);
    } catch (error) {
      failed = true;
      console.log(`FAIL ${name}: ${errorMessage(error)}`);
    }
  }
  return failed;
}

const server = startFixtureServer();
const client = await MarionetteClient.connect();
let originalHandle: string | null = null;
let failed = false;

try {
  originalHandle = extractHandle(await client.send("WebDriver:GetWindowHandle", {}));
  const testHandle = extractHandle(await client.send("WebDriver:NewWindow", { type: "tab" }));
  await client.send("WebDriver:SwitchToWindow", { handle: testHandle });
  await client.setContext("content");
  const context = new KeysTestContext(
    client,
    `http://127.0.0.1:${server.addr.port}`,
    testHandle,
  );
  await context.loadFixture("/");
  failed = await runAll(context);
  await client.send("WebDriver:CloseWindow", {});
} finally {
  if (originalHandle) {
    await client.send("WebDriver:SwitchToWindow", { handle: originalHandle });
  }
  await client.close();
  await server.shutdown();
}

if (failed) {
  Deno.exit(1);
}
