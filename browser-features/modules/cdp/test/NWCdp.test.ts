// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import { assert, assertEquals, runTests, type TestCase } from "../../../chrome/test/utils/test_harness.ts";
import { keyEventSources, mouseEventSources } from "../input.ts";
import { toRemoteObject } from "../remote-object.ts";
import { toCdpEvents } from "../events.ts";
import type { CdpEventMessage, JsonObject } from "../types.ts";
import { openTestTab, type PageServer, sleep, startPageServer, testGBrowser, type TestTab, waitFor } from "./page-server.ts";

type CdpModule = typeof import("../NWCdp.sys.mts");

function cdpModule(): CdpModule {
  return ChromeUtils.importESModule("resource://noraneko/cdp/NWCdp.sys.mjs") as CdpModule;
}

const PAGE = `<!doctype html>
<title>CDP test</title>
<body style="margin:0;height:3000px">
<button id="button" style="position:absolute;left:10px;top:10px;width:100px;height:40px">Press</button>
<input id="input" style="position:absolute;left:10px;top:80px;width:200px">
<script>
  window.clicks = [];
  window.keys = [];
  document.getElementById("button").addEventListener("click", (event) => {
    window.clicks.push({ trusted: event.isTrusted, x: event.clientX, y: event.clientY });
  });
  document.getElementById("input").addEventListener("keydown", (event) => {
    window.keys.push({ key: event.key, trusted: event.isTrusted, ctrl: event.ctrlKey });
  });
  window.pageOwn = "from the page";
</script>`;

const OTHER = `<!doctype html><title>Other page</title><p>other</p>`;

// ── Pure helpers ──────────────────────────────────────────────────────────

function testRemoteObjects(): void {
  assertEquals(JSON.stringify(toRemoteObject({ type: "number", value: 2 }, false)), JSON.stringify({ type: "number", value: 2, description: "2" }), "numbers");
  assertEquals(toRemoteObject({ type: "number", value: "NaN" }, false).unserializableValue, "NaN", "NaN is unserializable");
  assertEquals(toRemoteObject({ type: "null" }, false).subtype, "null", "null has its subtype");
  const object = toRemoteObject({ type: "object", value: [["a", { type: "number", value: 1 }], ["b", { type: "array", value: [{ type: "string", value: "x" }] }]] }, true);
  assertEquals(JSON.stringify(object.value), JSON.stringify({ a: 1, b: ["x"] }), "returnByValue gives the JSON value");
  assertEquals(object.description, '{a: 1, b: Array(1)}', "objects describe their entries");
  assertEquals(toRemoteObject({ type: "promise" }, false).subtype, "promise", "promises are objects of subtype promise");
}

function testMouseSources(): void {
  const [pointer] = mouseEventSources({ type: "mousePressed", x: 5, y: 6, button: "right", clickCount: 1 });
  assertEquals(pointer.type, "pointer", "a mouse press is pointer input");
  assertEquals(JSON.stringify(pointer.actions[1]), JSON.stringify({ type: "pointerDown", button: 2 }), "right button is 2");
  const withShift = mouseEventSources({ type: "mouseReleased", x: 1, y: 1, button: "left", modifiers: 8 });
  assertEquals(withShift.length, 2, "modifiers add a key source");
  assertEquals(withShift[0].actions.length, withShift[1].actions.length, "sources stay in step");
  let failed = false;
  try {
    mouseEventSources({ type: "mouseDragged", x: 1, y: 1 });
  } catch {
    failed = true;
  }
  assert(failed, "unknown mouse types are refused");
}

function testKeySources(): void {
  const lookup = (name: string) => (name === "Enter" ? "\uE006" : null);
  const [enter] = keyEventSources({ type: "keyDown", key: "Enter", code: "Enter" }, lookup);
  assertEquals(String(enter.actions[0].value), "\uE006", "named keys use WebDriver's code points");
  const [letter] = keyEventSources({ type: "keyDown", key: "a", modifiers: 2 }, lookup);
  assertEquals(letter.actions.length, 2, "modifiers go down before the key");
  assertEquals(String(letter.actions[1].value), "a", "printable keys are themselves");
}

function testEventTranslation(): void {
  const [consoleEvent] = toCdpEvents("log.entryAdded", {
    type: "console",
    method: "warn",
    level: "warn",
    text: "careful",
    args: [{ type: "string", value: "careful" }],
    timestamp: 1,
    source: { context: "ctx" },
  }, "ctx");
  assertEquals(consoleEvent.method, "Runtime.consoleAPICalled", "console entries are consoleAPICalled");
  assertEquals(consoleEvent.params.type, "warning", "warn is CDP's warning");

  const [failure] = toCdpEvents("network.fetchError", {
    context: "ctx",
    navigation: null,
    request: { request: "7", url: "http://x/missing", method: "GET" },
    timestamp: 1000,
    errorText: "NS_ERROR_CONNECTION_REFUSED",
  }, "ctx");
  assertEquals(failure.method, "Network.loadingFailed", "fetch errors are loadingFailed");
  assertEquals(failure.params.url, "http://x/missing", "loadingFailed carries the URL");

  const [frame] = toCdpEvents("browsingContext.navigationCommitted", { context: "ctx", navigation: "n", url: "http://x/" }, "ctx");
  assertEquals((frame.params.frame as JsonObject).parentId, undefined, "the top frame has no parent");
}

// ── The engine on a real tab ──────────────────────────────────────────────

let server: PageServer;
let tab: TestTab;
let engine: ReturnType<CdpModule["createCdpEngine"]>;

async function setUp(): Promise<void> {
  server = startPageServer({ "/page": PAGE, "/other": OTHER });
  tab = await openTestTab(server.url("/page"));
  engine = cdpModule().createCdpEngine();
}

async function tearDown(): Promise<void> {
  engine.destroy();
  testGBrowser().removeTab(tab);
  await server.stop();
}

function cdp(method: string, params: JsonObject = {}): Promise<JsonObject> {
  return engine.handle(tab.linkedBrowser, method, params);
}

async function evaluateValue(expression: string): Promise<unknown> {
  const { result } = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return (result as JsonObject).value;
}

async function testEvaluate(): Promise<void> {
  assertEquals(await evaluateValue("1 + 1"), 2, "evaluates expressions");
  assertEquals(await evaluateValue("window.pageOwn"), "from the page", "runs in the page's own realm");
  assertEquals(await evaluateValue("Promise.resolve(41).then((n) => n + 1)"), 42, "awaits promises");
  const object = await evaluateValue("({ title: document.title, list: [1, 2] })");
  assertEquals(JSON.stringify(object), JSON.stringify({ title: "CDP test", list: [1, 2] }), "returns objects by value");

  const thrown = await cdp("Runtime.evaluate", { expression: "throw new Error('boom')" });
  const details = thrown.exceptionDetails as JsonObject;
  assert(details, "exceptions come back as exceptionDetails");
  assert(String((details.exception as JsonObject).description).includes("boom"), "the exception describes the error");
}

async function testUnknownMethod(): Promise<void> {
  try {
    await cdp("Bogus.method");
  } catch (error) {
    const { CdpError } = cdpModule();
    assert(error instanceof CdpError, "fails with a CdpError");
    assertEquals(error.code, -32601, "unknown methods are -32601");
    assertEquals(error.message, "'Bogus.method' wasn't found", "says which method");
    return;
  }
  throw new Error("an unknown method should fail");
}

async function testTrustedClick(): Promise<void> {
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await cdp("Input.dispatchMouseEvent", { type, x: 50, y: 30, button: "left", clickCount: 1 });
  }
  const clicks = await waitFor(async () => {
    const value = await evaluateValue("window.clicks") as { trusted: boolean; x: number }[];
    return value.length > 0 ? value : null;
  }, "the click");
  assert(clicks[0].trusted, "the click is trusted input");
  assertEquals(clicks[0].x, 50, "at the given point");
}

async function testTyping(): Promise<void> {
  await cdp("Runtime.evaluate", { expression: "document.getElementById('input').focus()" });
  await cdp("Input.insertText", { text: "héllo ✓" });
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2 });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 });
  await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Backspace", code: "Backspace" });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace" });
  await cdp("Input.insertText", { text: "typed" });
  assertEquals(await evaluateValue("document.getElementById('input').value"), "typed", "Ctrl+A and Backspace cleared what insertText typed");
  const keys = await evaluateValue("window.keys") as { key: string; trusted: boolean; ctrl: boolean }[];
  assert(keys.every((key) => key.trusted), "key events are trusted");
  assert(keys.some((key) => key.key === "a" && key.ctrl), "the modifier was held");
}

async function testScreenshot(): Promise<void> {
  const { data } = await cdp("Page.captureScreenshot", {});
  const bytes = atob(String(data));
  assertEquals(bytes.slice(1, 4), "PNG", "PNG by default");
  const width = (bytes.charCodeAt(16) << 24) | (bytes.charCodeAt(17) << 16) | (bytes.charCodeAt(18) << 8) | bytes.charCodeAt(19);
  const viewport = await cdp("Runtime.evaluate", {
    expression: "[innerWidth, document.documentElement.clientWidth]",
    returnByValue: true,
  });
  const cssWidths = (viewport.result as { value: number[] }).value;
  assert(cssWidths.includes(width), `one pixel per CSS pixel: ${width} px for a viewport of ${cssWidths.join(" / ")}`);

  const jpeg = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 50, clip: { x: 0, y: 0, width: 120, height: 60, scale: 1 } });
  assertEquals(atob(String(jpeg.data)).charCodeAt(0), 0xff, "JPEG when asked");
}

async function testEvents(): Promise<void> {
  const events: CdpEventMessage[] = [];
  const stop = engine.subscribe(tab.linkedBrowser, (event) => events.push(event));
  try {
    // The subscription is asynchronous; give it a moment.
    await sleep(300);
    await cdp("Runtime.evaluate", {
      expression: "console.log('hello', 3); setTimeout(() => { throw new Error('late'); }); fetch('/missing').catch(() => {})",
    });
    const consoleEvent = await waitFor(() => events.find((event) => event.method === "Runtime.consoleAPICalled"), "console event");
    const args = consoleEvent.params.args as JsonObject[];
    assertEquals(args[0].value, "hello", "console arguments are RemoteObjects");
    const exception = await waitFor(() => events.find((event) => event.method === "Runtime.exceptionThrown"), "exception event");
    const details = exception.params.exceptionDetails as JsonObject;
    assert(String((details.exception as JsonObject).description).includes("late"), "uncaught errors are exceptionThrown");
    const response = await waitFor(
      () => events.find((event) => event.method === "Network.responseReceived" && (event.params.response as JsonObject).status === 404),
      "the 404 response",
    );
    const request = events.find((event) => event.method === "Network.requestWillBeSent" && event.params.requestId === response.params.requestId);
    assert(request, "requests are announced before their response");

    await cdp("Page.navigate", { url: server.url("/other") });
    await waitFor(() => events.find((event) => event.method === "Page.frameNavigated"), "frameNavigated");
    assertEquals(await evaluateValue("document.title"), "Other page", "navigate waits for the new document");
  } finally {
    stop();
  }
}

async function testRefusesPrivilegedPages(): Promise<void> {
  try {
    await cdp("Page.navigate", { url: "about:config" });
  } catch (error) {
    assertEquals((error as { code?: number }).code, -32602, "privileged pages can't be opened");
    return;
  }
  throw new Error("navigating to about:config should fail");
}

async function engineTest(fn: () => Promise<void>): Promise<void> {
  await setUp();
  try {
    await fn();
  } finally {
    await tearDown();
  }
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    { name: "BiDi values become CDP RemoteObjects", fn: testRemoteObjects },
    { name: "mouse events become pointer actions", fn: testMouseSources },
    { name: "key events become key actions", fn: testKeySources },
    { name: "BiDi events become CDP events", fn: testEventTranslation },
    { name: "Runtime.evaluate runs in the page", fn: () => engineTest(testEvaluate) },
    { name: "unknown methods fail with -32601", fn: () => engineTest(testUnknownMethod) },
    { name: "Input.dispatchMouseEvent clicks with trusted input", fn: () => engineTest(testTrustedClick) },
    { name: "Input.insertText and dispatchKeyEvent type trusted keys", fn: () => engineTest(testTyping) },
    { name: "Page.captureScreenshot is in CSS pixels", fn: () => engineTest(testScreenshot) },
    { name: "console, errors, network and navigation become events", fn: () => engineTest(testEvents) },
    { name: "privileged pages are refused", fn: () => engineTest(testRefusesPrivilegedPages) },
  ];
  await runTests("NWCdp.test.ts", tests);
}
