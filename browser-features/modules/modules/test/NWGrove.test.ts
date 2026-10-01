// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

// Kit's Grove connection against a fake Grove: a unix socket server in the
// test speaking Grove's ndjson RPC (neoworks-dev/grove#353).

import { assert, assertEquals, runTests, type TestCase } from "../../../chrome/test/utils/test_harness.ts";
import { RpcEndpoint, type RpcMessage, RpcReplyError } from "../../common/NWGroveRpc.ts";
import {
  openTestTab,
  type PageServer,
  sleep,
  startPageServer,
  testGBrowser,
  type TestTab,
  waitFor,
} from "../../cdp/test/page-server.ts";

type GroveModule = typeof import("../NWGrove.sys.mts");

function grove(): GroveModule {
  return ChromeUtils.importESModule("resource://noraneko/modules/NWGrove.sys.mjs") as GroveModule;
}

const ENABLED_PREF = "neoworks.grove.enabled";
const DISCOVERY_PREF = "neoworks.grove.discoveryPath";
const TOKEN_PREF = "neoworks.grove.token";
const WORKSPACES_PREF = "neoworks.workspaces";
const GROVE_WORKSPACES_PREF = "neoworks.grove.workspaces";

const PAGE = `<!doctype html><title>Served page</title><p>served</p>`;

interface Received {
  method: string;
  params: Record<string, unknown>;
}

interface FakeConnection {
  rpc: RpcEndpoint;
  closed: boolean;
  close(): void;
}

// A Grove as far as Kit can tell: the discovery file, the socket, and the
// browser.* routes, recording what Kit sends.
class FakeGrove {
  readonly socketPath: string;
  readonly discoveryPath: string;
  readonly pid: number;
  readonly connections: FakeConnection[] = [];
  readonly received: Received[] = [];
  readonly events: Record<string, unknown>[] = [];
  readonly server: nsIServerSocket;
  denyHello = false;
  worktrees = [{ id: "/work/feature-b", name: "feature-b", branch: "feature/b", path: "/work/feature-b" }];

  constructor(name: string, pid: number) {
    const directory = PathUtils.tempDir;
    this.socketPath = PathUtils.join(directory, `kit-grove-${name}-${Date.now()}.sock`);
    this.discoveryPath = PathUtils.join(directory, `kit-grove-${name}-${Date.now()}.json`);
    this.pid = pid;
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(this.socketPath);
    this.server = Cc["@mozilla.org/network/server-socket;1"].createInstance(Ci.nsIServerSocket);
    this.server.initWithFilename(file, 0o600, -1);
    this.server.asyncListen({
      onSocketAccepted: (_server: nsIServerSocket, transport: nsISocketTransport) => this.accept(transport),
      onStopListening: () => {},
    } as nsIServerSocketListener);
  }

  async writeDiscovery(): Promise<void> {
    await IOUtils.writeUTF8(
      this.discoveryPath,
      JSON.stringify({ socketPath: this.socketPath, apiVersion: "1", pid: this.pid }),
    );
  }

  accept(transport: nsISocketTransport): void {
    const socket = new (grove().GroveSocket)(transport);
    const rpc = new RpcEndpoint((message: RpcMessage) => socket.send(message), "even");
    const connection: FakeConnection = { rpc, closed: false, close: () => socket.close() };
    this.connections.push(connection);
    const record = (method: string) => (params: unknown) => {
      this.received.push({ method, params: (params ?? {}) as Record<string, unknown> });
      return Promise.resolve(null);
    };
    rpc.handle("api.hello", (params) => {
      this.received.push({ method: "api.hello", params: params as Record<string, unknown> });
      if (this.denyHello) {
        return Promise.reject(new RpcReplyError("unauthenticated", "pairing denied for kit"));
      }
      const token = (params as { token?: string }).token;
      return Promise.resolve({
        apiVersion: "1",
        grantedScopes: ["browser.provide"],
        ...(token ? {} : { token: "secret-1" }),
      });
    });
    rpc.handle("browser.worktrees", () => Promise.resolve(this.worktrees));
    rpc.handle("browser.provide", record("browser.provide"));
    rpc.handle("browser.withdraw", record("browser.withdraw"));
    socket.listen((message) => {
      if (message.kind === "event") {
        this.events.push(message.payload as Record<string, unknown>);
      }
      rpc.handleMessage(message);
    }, () => {
      connection.closed = true;
      rpc.failAllPending("closed");
    });
  }

  latest(): FakeConnection {
    const connection = this.connections.at(-1);
    if (!connection) {
      throw new Error("Kit hasn't connected");
    }
    return connection;
  }

  sent(method: string): Received[] {
    return this.received.filter((entry) => entry.method === method);
  }

  async stop(): Promise<void> {
    for (const connection of this.connections) {
      connection.close();
    }
    this.server.close();
    await IOUtils.remove(this.discoveryPath, { ignoreAbsent: true });
    await IOUtils.remove(this.socketPath, { ignoreAbsent: true });
  }
}

let fake: FakeGrove;
let pages: PageServer;
let tab: TestTab;
let openedTab: TestTab | undefined;
let workspacesBefore = "";
// The profile's own Grove settings, put back afterwards: the test profile is
// also the dev profile, and a cleared discovery path is Grove's real one.
const savedPrefs = new Map<string, string | boolean | null>();

function savePref(name: string): void {
  switch (Services.prefs.getPrefType(name)) {
    case Services.prefs.PREF_STRING:
      savedPrefs.set(name, Services.prefs.getStringPref(name));
      return;
    case Services.prefs.PREF_BOOL:
      savedPrefs.set(name, Services.prefs.getBoolPref(name));
      return;
    default:
      savedPrefs.set(name, null);
  }
}

function restorePrefs(): void {
  for (const [name, value] of savedPrefs) {
    if (value === null) {
      Services.prefs.clearUserPref(name);
    } else if (typeof value === "boolean") {
      Services.prefs.setBoolPref(name, value);
    } else {
      Services.prefs.setStringPref(name, value);
    }
  }
}

async function setUp(): Promise<void> {
  // Restored in this order: the setting last, once its discovery path is back.
  for (const name of [DISCOVERY_PREF, TOKEN_PREF, GROVE_WORKSPACES_PREF, ENABLED_PREF]) {
    savePref(name);
  }
  Services.prefs.setBoolPref(ENABLED_PREF, false);
  Services.prefs.clearUserPref(TOKEN_PREF);
  workspacesBefore = Services.prefs.getStringPref(WORKSPACES_PREF, "");
  fake = new FakeGrove("main", 4242);
  await fake.writeDiscovery();
  Services.prefs.setStringPref(DISCOVERY_PREF, fake.discoveryPath);
  pages = startPageServer({ "/served": PAGE });
  grove().initGrove();
}

async function tearDown(): Promise<void> {
  Services.prefs.setBoolPref(ENABLED_PREF, false);
  await sleep(200);
  for (const candidate of [tab, openedTab]) {
    try {
      if (candidate?.isConnected) {
        testGBrowser().removeTab(candidate);
      }
    } catch (error) {
      console.error("[NWGrove.test] Couldn't close a test tab:", error);
    }
  }
  // Drop the workspace browser.open made, once the window is done with the
  // closed tab.
  await sleep(200);
  const before = new Set(
    (JSON.parse(workspacesBefore || "[]") as { id: string }[]).map((workspace) => workspace.id),
  );
  const now = JSON.parse(Services.prefs.getStringPref(WORKSPACES_PREF, "[]")) as { id: string; icon: string }[];
  const kept = now.filter((workspace) => before.has(workspace.id) || workspace.icon !== "git-branch");
  if (kept.length !== now.length) {
    Services.prefs.setStringPref(WORKSPACES_PREF, JSON.stringify(kept));
  }
  restorePrefs();
  await fake.stop();
  await pages.stop();
}

async function testOffConnectsNothing(): Promise<void> {
  // Longer than Kit's poll interval: it would have looked by now.
  await sleep(2500);
  assertEquals(fake.connections.length, 0, "with the setting off Kit doesn't connect");
  assertEquals(grove().groveStatus().state, "off", "the state is off");
}

async function testOnConnectsAndPairs(): Promise<void> {
  Services.prefs.setBoolPref(ENABLED_PREF, true);
  const hello = await waitFor(() => fake.sent("api.hello")[0], "api.hello");
  assertEquals(hello.params.appId, "kit", "Kit says hello as kit");
  assertEquals(JSON.stringify(hello.params.requestedScopes), JSON.stringify(["browser.provide"]), "asking for browser.provide");
  assertEquals(hello.params.token, undefined, "without a token the first time");
  await waitFor(() => grove().groveStatus().state === "connected", "the connected state");
  assertEquals(Services.prefs.getStringPref(TOKEN_PREF, ""), "secret-1", "Kit keeps the token Grove handed out");
}

async function testProvideAndCdp(): Promise<void> {
  tab = await openTestTab(pages.url("/served"));
  await grove().provideTab(tab.linkedBrowser, { id: "/work/main", name: "main" });
  const provide = await waitFor(() => fake.sent("browser.provide")[0], "browser.provide");
  assertEquals(provide.params.worktreeId, "/work/main", "provides the worktree");
  assertEquals((provide.params.tab as { url: string }).url, pages.url("/served"), "with the tab's URL");
  assertEquals(tab.getAttribute("nw-grove"), "main", "the tab shows the worktree it serves");

  const rpc = fake.latest().rpc;
  const evaluated = await rpc.request("browser.cdp", {
    worktreeId: "/work/main",
    method: "Runtime.evaluate",
    params: { expression: "6 * 7", returnByValue: true },
  }) as { result: { value: number } };
  assertEquals(evaluated.result.value, 42, "browser.cdp answers with the CDP result");

  let failure: RpcReplyError | null = null;
  try {
    await rpc.request("browser.cdp", { worktreeId: "/work/main", method: "Nope.nothing", params: {} });
  } catch (error) {
    failure = error as RpcReplyError;
  }
  assertEquals(failure?.code, -32601, "an unknown method is a CDP -32601 error");
  assertEquals(failure?.message, "'Nope.nothing' wasn't found", "with CDP's message");

  await rpc.request("browser.cdp", {
    worktreeId: "/work/main",
    method: "Runtime.evaluate",
    params: { expression: "console.log('from the page')" },
  });
  const event = await waitFor(
    () => fake.events.find((payload) => payload.method === "Runtime.consoleAPICalled"),
    "a browser.cdpEvent",
  );
  assertEquals(event.worktreeId, "/work/main", "events name their worktree");

  await rpc.request("browser.cdp", {
    worktreeId: "/work/main",
    method: "Input.dispatchMouseEvent",
    params: { type: "mousePressed", x: 5, y: 5, button: "left", clickCount: 1 },
  });
  assertEquals(tab.getAttribute("nw-grove-activity"), "Clicking", "the tab shows what the agent does");
  await rpc.request("browser.cdp", {
    worktreeId: "/work/main",
    method: "Input.dispatchMouseEvent",
    params: { type: "mouseReleased", x: 5, y: 5, button: "left", clickCount: 1 },
  });
  await waitFor(() => !tab.hasAttribute("nw-grove-activity"), "the activity to clear", 5000);
}

async function testBrowserOpen(): Promise<void> {
  const rpc = fake.latest().rpc;
  await rpc.request("browser.open", { worktreeId: "/work/feature-b" });
  const provide = await waitFor(
    () => fake.sent("browser.provide").find((entry) => entry.params.worktreeId === "/work/feature-b"),
    "browser.provide for the opened tab",
  );
  assert(provide, "the opened tab is provided");
  const opened = testGBrowser().tabs.find((candidate) => candidate.getAttribute("nw-grove") === "feature-b");
  assert(opened, "a tab serves the worktree, named after it");
  openedTab = opened;
  const workspaces = JSON.parse(Services.prefs.getStringPref(WORKSPACES_PREF, "[]")) as { name: string; icon: string }[];
  const workspace = workspaces.find((candidate) => candidate.name === "feature-b");
  assert(workspace, "the tab opened in a workspace named after the worktree");
  assertEquals(workspace.icon, "git-branch", "marked as Grove's");
}

async function testReconnectsAfterRestart(): Promise<void> {
  const before = fake.connections.length;
  fake.latest().close();
  await waitFor(() => grove().groveStatus().state !== "connected", "Kit to notice Grove left");
  await waitFor(() => fake.connections.length > before && grove().groveStatus().state === "connected", "Kit to reconnect", 10_000);
  const hello = fake.sent("api.hello").at(-1);
  assertEquals(hello?.params.token, "secret-1", "reconnecting with the stored token");
  const reprovided = await waitFor(
    () => fake.sent("browser.provide").filter((entry) => entry.params.worktreeId === "/work/main").length > 1,
    "the tab to be provided again",
  );
  assert(reprovided, "served tabs are provided again");
}

async function testOffWithdrawsAndDisconnects(): Promise<void> {
  const connection = fake.latest();
  Services.prefs.setBoolPref(ENABLED_PREF, false);
  await waitFor(() => connection.closed, "Kit to disconnect");
  const withdrawn = fake.sent("browser.withdraw").map((entry) => entry.params.worktreeId).sort();
  assertEquals(JSON.stringify(withdrawn), JSON.stringify(["/work/feature-b", "/work/main"]), "every served tab is withdrawn first");
  assert(!tab.hasAttribute("nw-grove"), "the tab no longer shows a worktree");
  assertEquals(grove().groveStatus().state, "off", "the state is off");
  await sleep(100);
  assert(document.getElementById("tabbrowser-tabbox")?.isConnected, "the window keeps its tab panels");
  assert(testGBrowser().selectedTab.linkedBrowser.browsingContext, "the selected tab still has its page");
}

async function testDeniedPairingStaysQuiet(): Promise<void> {
  Services.prefs.clearUserPref(TOKEN_PREF);
  fake.denyHello = true;
  const before = fake.connections.length;
  Services.prefs.setBoolPref(ENABLED_PREF, true);
  await waitFor(() => grove().groveStatus().state === "denied", "the denied state");
  await sleep(2500);
  assertEquals(fake.connections.length, before + 1, "Kit doesn't ask a Grove that said no again by itself");
  Services.prefs.setBoolPref(ENABLED_PREF, false);
  fake.denyHello = false;
}

export async function runAllTests(): Promise<void> {
  await setUp();
  try {
    const tests: TestCase[] = [
      { name: "with the setting off, Kit doesn't connect", fn: testOffConnectsNothing },
      { name: "turning it on connects, pairs and keeps the token", fn: testOnConnectsAndPairs },
      { name: "a provided tab answers browser.cdp and sends events", fn: testProvideAndCdp },
      { name: "browser.open opens a tab in the worktree's workspace", fn: testBrowserOpen },
      { name: "Kit reconnects when Grove comes back", fn: testReconnectsAfterRestart },
      { name: "turning it off withdraws the tabs and disconnects", fn: testOffWithdrawsAndDisconnects },
      { name: "a turned-down pairing isn't asked again by itself", fn: testDeniedPairingStaysQuiet },
    ];
    await runTests("NWGrove.test.ts", tests);
  } finally {
    await tearDown();
  }
}
