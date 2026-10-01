// SPDX-License-Identifier: MPL-2.0

// Kit as Grove's browser (#81): Grove's coding agents drive a tab of the
// user's own browser through Kit's CDP engine (cdp/NWCdp.sys.mts), over
// Grove's local API socket. The protocol is neoworks-dev/grove#353.
//
// A developer setting, off by default (neoworks.grove.enabled). Off, Kit
// reads nothing of Grove's and opens no socket. On, it looks for the
// discovery file Grove writes while it runs, connects to the unix socket it
// names, says api.hello as app `kit` asking for the `browser.provide` scope,
// and keeps the token Grove hands out once the user approves the pairing in
// Grove. It reconnects when Grove restarts and stays quiet while Grove isn't
// running. Turning it off withdraws every tab and disconnects.
//
// The user hands a tab to a worktree from the tab's menu (neoworks-grove);
// Grove can also ask for one (browser.open), which opens a tab in a
// workspace named after the worktree. A served tab carries nw-grove (the
// worktree's name) and, while an agent's command runs, nw-grove-activity
// (what it does, in words), on the tab and its .browserContainer, for the
// sidebar and the tab's frame to show.

import {
  encodeFrame,
  FrameDecoder,
  FrameError,
  RpcEndpoint,
  RpcReplyError,
  type RpcMessage,
} from "../common/NWGroveRpc.ts";

export const GROVE_ENABLED_PREF = "neoworks.grove.enabled";
// Where Grove's discovery file is; empty for Grove's default place.
export const GROVE_DISCOVERY_PREF = "neoworks.grove.discoveryPath";
const TOKEN_PREF = "neoworks.grove.token";

// Observers are told (no subject, no data) whenever the state or the served
// tabs change.
export const GROVE_CHANGED_TOPIC = "neoworks-grove-changed";

export const GROVE_ATTRIBUTE = "nw-grove";
export const GROVE_ACTIVITY_ATTRIBUTE = "nw-grove-activity";

const APP_ID = "kit";
const SCOPE = "browser.provide";
const CDP_EVENT_CHANNEL = "browser.cdpEvent";
// How often Kit looks for a Grove that isn't running yet.
const POLL_MS = 2000;
// A command's activity stays up this long after it ends, so a burst of
// commands reads as one.
const ACTIVITY_LINGER_MS = 1200;
const WITHDRAW_TIMEOUT_MS = 1000;
const CDP_SERVER_ERROR = -32000;

const { setTimeout, clearTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs",
) as { setTimeout: typeof globalThis.setTimeout; clearTimeout: typeof globalThis.clearTimeout };
const { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs") as {
  NetUtil: { readInputStream(stream: nsIInputStream, count: number): ArrayBuffer };
};

type CdpModule = typeof import("../cdp/NWCdp.sys.mts");

function cdp(): CdpModule {
  return ChromeUtils.importESModule("resource://noraneko/cdp/NWCdp.sys.mjs") as CdpModule;
}

export type GroveState =
  // The setting is off.
  | "off"
  // On, but Grove isn't running (or Kit can't reach it).
  | "searching"
  | "connecting"
  // api.hello is out without a valid token: Grove asks the user.
  | "pairing"
  | "connected"
  // The user turned the pairing down in Grove; Kit waits for them to ask
  // again (reconnectGrove) or for another Grove to start.
  | "denied";

export interface GroveWorktree {
  id: string;
  name: string;
  branch: string;
  path: string;
}

export interface ServedTab {
  worktree: { id: string; name: string };
  tab: TabElement;
  browser: XULBrowserElement;
}

export interface GroveStatus {
  state: GroveState;
  served: ServedTab[];
}

// What a browser window does for Grove: open a tab in the workspace for a
// worktree (neoworks-grove registers one per window).
export interface GroveWindowHost {
  openWorktreeTab(worktree: { id: string; name: string }, url: string): { linkedBrowser: object };
}

export interface TabElement extends Element {
  linkedBrowser: XULBrowserElement;
  label: string;
}

interface Discovery {
  socketPath: string;
  apiVersion: string;
  pid: number;
}

// ── The socket ──────────────────────────────────────────────────────────

// UTF-8 as the byte string nsIOutputStream.write takes.
function utf8Bytes(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return out;
}

// One ndjson connection over a unix socket transport, either end: Kit's
// connection to Grove, or (in tests) a fake Grove's accepted connection.
export class GroveSocket {
  readonly #transport: nsISocketTransport;
  readonly #output: nsIAsyncOutputStream;
  readonly #pump: nsIInputStreamPump;
  readonly #decoder = new FrameDecoder();
  #pending = "";
  #closed = false;
  #onMessage: (message: RpcMessage) => void = () => {};
  #onClose: () => void = () => {};

  static connect(path: string): GroveSocket {
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(path);
    const service = Cc["@mozilla.org/network/socket-transport-service;1"].getService(
      Ci.nsISocketTransportService,
    );
    return new GroveSocket(service.createUnixDomainTransport(file));
  }

  constructor(transport: nsISocketTransport) {
    this.#transport = transport;
    this.#output = transport.openOutputStream(0, 0, 0).QueryInterface!(Ci.nsIAsyncOutputStream);
    const input = transport.openInputStream(0, 0, 0);
    this.#pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(Ci.nsIInputStreamPump);
    this.#pump.init(input, 0, 0, false);
    this.#pump.asyncRead(this.#listener);
  }

  // Set the callbacks before the first message can arrive: right after
  // construction, in the same tick.
  listen(onMessage: (message: RpcMessage) => void, onClose: () => void): void {
    this.#onMessage = onMessage;
    this.#onClose = onClose;
  }

  get closed(): boolean {
    return this.#closed;
  }

  send(message: RpcMessage): void {
    if (this.#closed) {
      return;
    }
    this.#pending += utf8Bytes(encodeFrame(message));
    this.#flush();
  }

  // Writes what the socket takes now and waits for it to take the rest.
  // Before the socket has connected it takes nothing.
  #flush(): void {
    if (this.#closed || this.#pending.length === 0) {
      return;
    }
    try {
      const written = this.#output.write(this.#pending, this.#pending.length);
      this.#pending = this.#pending.slice(written);
    } catch (error) {
      // Would block: not connected yet, or the socket's buffer is full.
      if ((error as { result?: number }).result !== Cr.NS_BASE_STREAM_WOULD_BLOCK) {
        this.close();
        return;
      }
    }
    if (this.#pending.length > 0) {
      this.#output.asyncWait({ onOutputStreamReady: () => this.#flush() }, 0, 0, Services.tm.mainThread);
    }
  }

  readonly #listener = {
    onStartRequest: (): void => {},
    onDataAvailable: (_request: nsIRequest, stream: nsIInputStream, _offset: number, count: number): void => {
      let messages: RpcMessage[];
      try {
        messages = this.#decoder.push(new Uint8Array(NetUtil.readInputStream(stream, count)));
      } catch (error) {
        if (error instanceof FrameError) {
          console.error("[NWGrove]", error.message);
          this.close();
          return;
        }
        throw error;
      }
      for (const message of messages) {
        this.#onMessage(message);
      }
    },
    onStopRequest: (): void => this.close(),
    QueryInterface: ChromeUtils.generateQI(["nsIStreamListener", "nsIRequestObserver"]),
  };

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#pending = "";
    try {
      this.#pump.cancel(Cr.NS_BINDING_ABORTED);
    } catch {
      // Already stopped.
    }
    this.#transport.close(Cr.NS_OK);
    this.#onClose();
  }
}

// ── State ───────────────────────────────────────────────────────────────

let state: GroveState = "off";
let socket: GroveSocket | null = null;
let endpoint: RpcEndpoint | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
// The Grove (by pid) whose pairing the user turned down.
let deniedPid: number | null = null;
let connectedPid: number | null = null;
let worktrees: GroveWorktree[] = [];
// By worktree id.
const served = new Map<string, ServedEntry>();
const windowHosts = new Map<Window, GroveWindowHost>();
let engine: ReturnType<CdpModule["createCdpEngine"]> | null = null;

interface ServedEntry extends ServedTab {
  unsubscribe: () => void;
  onClose: () => void;
  activityTimer: ReturnType<typeof setTimeout> | null;
  running: number;
}

function cdpEngine(): ReturnType<CdpModule["createCdpEngine"]> {
  engine ??= cdp().createCdpEngine();
  return engine;
}

function notify(): void {
  Services.obs.notifyObservers(null as unknown as nsISupports, GROVE_CHANGED_TOPIC);
}

function setState(next: GroveState): void {
  if (state === next) {
    return;
  }
  state = next;
  notify();
}

export function groveStatus(): GroveStatus {
  return {
    state,
    served: [...served.values()].map(({ worktree, tab, browser }) => ({ worktree, tab, browser })),
  };
}

export function isGroveEnabled(): boolean {
  return Services.prefs.getBoolPref(GROVE_ENABLED_PREF, false);
}

// Grove's discovery file: <userData>/grove-api.json, where Electron keeps
// userData for an app named "grove".
export function discoveryPath(): string {
  const configured = Services.prefs.getStringPref(GROVE_DISCOVERY_PREF, "");
  if (configured) {
    return configured;
  }
  const home = Services.dirsvc.get("Home", Ci.nsIFile).path;
  if (Services.appinfo.OS === "Darwin") {
    return PathUtils.join(home, "Library", "Application Support", "grove", "grove-api.json");
  }
  const config = Services.env.get("XDG_CONFIG_HOME") || PathUtils.join(home, ".config");
  return PathUtils.join(config, "grove", "grove-api.json");
}

async function readDiscovery(): Promise<Discovery | null> {
  try {
    const parsed = JSON.parse(await IOUtils.readUTF8(discoveryPath())) as Partial<Discovery>;
    if (typeof parsed.socketPath !== "string" || !parsed.socketPath) {
      return null;
    }
    return { socketPath: parsed.socketPath, apiVersion: String(parsed.apiVersion ?? ""), pid: Number(parsed.pid ?? 0) };
  } catch {
    // No Grove running, or a file half written: look again later.
    return null;
  }
}

// ── Connecting ──────────────────────────────────────────────────────────

function schedulePoll(delay = POLL_MS): void {
  if (pollTimer !== null || !isGroveEnabled()) {
    return;
  }
  pollTimer = setTimeout(() => {
    pollTimer = null;
    void poll();
  }, delay);
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

async function poll(): Promise<void> {
  if (!isGroveEnabled() || socket) {
    return;
  }
  const discovery = await readDiscovery();
  if (!isGroveEnabled() || socket) {
    return;
  }
  if (!discovery || discovery.pid === deniedPid) {
    setState(deniedPid !== null && discovery?.pid === deniedPid ? "denied" : "searching");
    schedulePoll();
    return;
  }
  connect(discovery);
}

function connect(discovery: Discovery): void {
  setState("connecting");
  let opened: GroveSocket;
  try {
    opened = GroveSocket.connect(discovery.socketPath);
  } catch (error) {
    console.error("[NWGrove] Couldn't open Grove's socket:", error);
    setState("searching");
    schedulePoll();
    return;
  }
  socket = opened;
  const rpc = new RpcEndpoint((message) => opened.send(message), "odd");
  endpoint = rpc;
  rpc.handle("browser.cdp", (params) => answerCdp(params));
  rpc.handle("browser.open", (params) => answerOpen(params));
  opened.listen((message) => rpc.handleMessage(message), () => onDisconnected(opened, rpc));
  void hello(rpc, discovery.pid);
}

async function hello(rpc: RpcEndpoint, pid: number): Promise<void> {
  const token = Services.prefs.getStringPref(TOKEN_PREF, "");
  if (!token) {
    setState("pairing");
  }
  let result: { grantedScopes?: string[]; token?: string };
  try {
    result = await rpc.request("api.hello", {
      appId: APP_ID,
      name: "Kit",
      version: Services.appinfo.version,
      requestedScopes: [SCOPE],
      ...(token ? { token } : {}),
    }) as { grantedScopes?: string[]; token?: string };
  } catch (error) {
    if (endpoint !== rpc) {
      return;
    }
    // Turned down or not answered in Grove, or the connection dropped while
    // Grove was asking: don't ask this Grove again until the user does, or
    // the user would get a pairing prompt every few seconds.
    deniedPid = pid;
    console.error("[NWGrove] Grove didn't let Kit in:", error);
    socket?.close();
    return;
  }
  if (endpoint !== rpc) {
    return;
  }
  if (result.token) {
    Services.prefs.setStringPref(TOKEN_PREF, result.token);
  }
  if (!result.grantedScopes?.includes(SCOPE)) {
    console.error("[NWGrove] Grove didn't grant the browser.provide scope.");
    deniedPid = pid;
    socket?.close();
    return;
  }
  deniedPid = null;
  connectedPid = pid;
  setState("connected");
  // Tabs that served a worktree before Grove went away serve it again.
  for (const entry of served.values()) {
    void sendProvide(entry);
  }
}

function onDisconnected(closed: GroveSocket, rpc: RpcEndpoint): void {
  rpc.failAllPending("Grove disconnected");
  if (socket !== closed) {
    return;
  }
  socket = null;
  endpoint = null;
  connectedPid = null;
  worktrees = [];
  if (!isGroveEnabled()) {
    setState("off");
    return;
  }
  setState(deniedPid !== null ? "denied" : "searching");
  schedulePoll();
}

function start(): void {
  if (socket || pollTimer !== null) {
    return;
  }
  setState("searching");
  void poll();
}

// Withdraws every served tab, then disconnects.
async function stop(): Promise<void> {
  stopPolling();
  const rpc = endpoint;
  const withdrawals = [...served.keys()].map((worktreeId) => {
    releaseTab(worktreeId);
    if (!rpc || state !== "connected") {
      return Promise.resolve();
    }
    return withTimeout(rpc.request("browser.withdraw", { worktreeId }), WITHDRAW_TIMEOUT_MS);
  });
  await Promise.allSettled(withdrawals);
  socket?.close();
  socket = null;
  endpoint = null;
  connectedPid = null;
  deniedPid = null;
  worktrees = [];
  engine?.destroy();
  engine = null;
  setState("off");
}

// Asks a Grove whose pairing was turned down again.
export function reconnectGrove(): void {
  if (!isGroveEnabled()) {
    return;
  }
  deniedPid = null;
  stopPolling();
  start();
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), milliseconds);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

// ── Worktrees and tabs ──────────────────────────────────────────────────

function isWorktree(value: unknown): value is GroveWorktree {
  const candidate = value as Partial<GroveWorktree> | null;
  return typeof candidate?.id === "string" && typeof candidate.name === "string";
}

// The worktrees Kit can hand a tab to; empty when not connected.
export async function groveWorktrees(): Promise<GroveWorktree[]> {
  const rpc = endpoint;
  if (!rpc || state !== "connected") {
    return [];
  }
  const listed = await rpc.request("browser.worktrees", {});
  worktrees = Array.isArray(listed)
    ? listed.filter(isWorktree).map((worktree) => ({
      id: worktree.id,
      name: worktree.name,
      branch: typeof worktree.branch === "string" ? worktree.branch : "",
      path: typeof worktree.path === "string" ? worktree.path : worktree.id,
    }))
    : [];
  return worktrees;
}

function tabOf(browser: XULBrowserElement): TabElement | null {
  const view = browser.ownerDocument?.defaultView as
    | (Window & { gBrowser?: { getTabForBrowser(browser: XULBrowserElement): TabElement | null } })
    | null
    | undefined;
  return view?.gBrowser?.getTabForBrowser(browser) ?? null;
}

function markTab(entry: ServedTab, attributes: Record<string, string | null>): void {
  const container = entry.browser.closest(".browserContainer");
  for (const [name, value] of Object.entries(attributes)) {
    for (const element of [entry.tab, container]) {
      if (value === null) {
        element?.removeAttribute(name);
      } else {
        element?.setAttribute(name, value);
      }
    }
  }
  const view = entry.tab.ownerDocument?.defaultView;
  if (view) {
    entry.tab.dispatchEvent(
      new view.CustomEvent("TabAttrModified", { bubbles: true, detail: { changed: Object.keys(attributes) } }),
    );
  }
}

// The worktree a tab serves, or null.
export function servedWorktreeOf(browser: XULBrowserElement): { id: string; name: string } | null {
  for (const entry of served.values()) {
    if (entry.browser === browser) {
      return entry.worktree;
    }
  }
  return null;
}

async function sendProvide(entry: ServedEntry): Promise<void> {
  const rpc = endpoint;
  if (!rpc || state !== "connected") {
    return;
  }
  const tab = { url: entry.browser.currentURI?.spec ?? "", title: entry.tab.label ?? "" };
  try {
    await rpc.request("browser.provide", { worktreeId: entry.worktree.id, tab });
  } catch (error) {
    console.error("[NWGrove] Grove didn't take the tab:", error);
  }
}

// Hands a tab to a worktree's agents: it replaces whatever tab served the
// worktree before, and stops serving any other worktree.
export async function provideTab(browser: XULBrowserElement, worktree: { id: string; name: string }): Promise<void> {
  const tab = tabOf(browser);
  if (!tab) {
    throw new Error("That tab is gone.");
  }
  if (browser.browsingContext?.usePrivateBrowsing) {
    throw new Error("Private tabs can't be handed to Grove.");
  }
  const current = servedWorktreeOf(browser);
  if (current && current.id !== worktree.id) {
    await withdrawWorktree(current.id);
  }
  releaseTab(worktree.id);
  const onClose = () => void withdrawWorktree(worktree.id);
  tab.addEventListener("TabClose", onClose, { once: true });
  const entry: ServedEntry = {
    worktree: { id: worktree.id, name: worktree.name },
    tab,
    browser,
    onClose,
    unsubscribe: cdpEngine().subscribe(browser, (event) => {
      endpoint?.event(CDP_EVENT_CHANNEL, { worktreeId: worktree.id, method: event.method, params: event.params });
    }),
    activityTimer: null,
    running: 0,
  };
  served.set(worktree.id, entry);
  markTab(entry, { [GROVE_ATTRIBUTE]: worktree.name });
  notify();
  await sendProvide(entry);
}

// Stops serving the worktree here, without telling Grove.
function releaseTab(worktreeId: string): void {
  const entry = served.get(worktreeId);
  if (!entry) {
    return;
  }
  served.delete(worktreeId);
  entry.unsubscribe();
  entry.tab.removeEventListener("TabClose", entry.onClose);
  if (entry.activityTimer !== null) {
    clearTimeout(entry.activityTimer);
  }
  markTab(entry, { [GROVE_ATTRIBUTE]: null, [GROVE_ACTIVITY_ATTRIBUTE]: null });
  notify();
}

// Takes the worktree's tab back from Grove.
export async function withdrawWorktree(worktreeId: string): Promise<void> {
  if (!served.has(worktreeId)) {
    return;
  }
  releaseTab(worktreeId);
  const rpc = endpoint;
  if (!rpc || state !== "connected") {
    return;
  }
  try {
    await withTimeout(rpc.request("browser.withdraw", { worktreeId }), WITHDRAW_TIMEOUT_MS);
  } catch (error) {
    console.error("[NWGrove] Grove didn't take the withdrawal:", error);
  }
}

// Takes a tab back from Grove, whichever worktree it serves.
export async function withdrawTab(browser: XULBrowserElement): Promise<void> {
  const worktree = servedWorktreeOf(browser);
  if (worktree) {
    await withdrawWorktree(worktree.id);
  }
}

export function registerGroveWindow(window: Window, host: GroveWindowHost): () => void {
  windowHosts.set(window, host);
  return () => windowHosts.delete(window);
}

// ── Grove's requests ────────────────────────────────────────────────────

// What a command does, in words for the tab; null for ones that only read.
function activityOf(method: string, params: Record<string, unknown>): string | null {
  switch (method) {
    case "Page.navigate":
      return `Opening ${String(params.url)}`;
    case "Page.reload":
      return "Reloading";
    case "Input.insertText":
      return "Typing";
    case "Input.dispatchMouseEvent":
      if (params.type === "mouseWheel") {
        return "Scrolling";
      }
      return params.type === "mouseMoved" ? null : "Clicking";
    case "Input.dispatchKeyEvent":
      if (params.type === "keyDown" || params.type === "rawKeyDown") {
        return `Pressing ${String(params.key ?? params.code ?? "a key")}`;
      }
      return params.type === "char" ? "Typing" : null;
    default:
      return null;
  }
}

function startActivity(entry: ServedEntry, text: string): void {
  if (entry.activityTimer !== null) {
    clearTimeout(entry.activityTimer);
    entry.activityTimer = null;
  }
  entry.running += 1;
  markTab(entry, { [GROVE_ACTIVITY_ATTRIBUTE]: text });
}

function endActivity(entry: ServedEntry): void {
  entry.running = Math.max(0, entry.running - 1);
  if (entry.running > 0) {
    return;
  }
  entry.activityTimer = setTimeout(() => {
    entry.activityTimer = null;
    if (served.get(entry.worktree.id) === entry) {
      markTab(entry, { [GROVE_ACTIVITY_ATTRIBUTE]: null });
    }
  }, ACTIVITY_LINGER_MS);
}

function paramsOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function answerCdp(raw: unknown): Promise<unknown> {
  const request = paramsOf(raw);
  const worktreeId = String(request.worktreeId ?? "");
  const method = typeof request.method === "string" ? request.method : "";
  const params = paramsOf(request.params);
  const entry = served.get(worktreeId);
  if (!entry) {
    throw new RpcReplyError(CDP_SERVER_ERROR, "No Kit tab serves this worktree.");
  }
  const activity = activityOf(method, params);
  if (activity) {
    startActivity(entry, activity);
  }
  try {
    return await cdpEngine().handle(entry.browser, method, params as Parameters<ReturnType<CdpModule["createCdpEngine"]>["handle"]>[2]);
  } catch (error) {
    const { CdpError } = cdp();
    if (error instanceof CdpError) {
      throw new RpcReplyError(error.code, error.message);
    }
    throw error;
  } finally {
    if (activity) {
      endActivity(entry);
    }
  }
}

function mostRecentHost(): GroveWindowHost | null {
  const window = Services.wm.getMostRecentWindow("navigator:browser") as Window | null;
  if (window && windowHosts.has(window)) {
    return windowHosts.get(window) ?? null;
  }
  return windowHosts.values().next().value ?? null;
}

// browser.open {worktreeId, url?}: a tab for the worktree, in its own
// workspace, handed to Grove.
async function answerOpen(raw: unknown): Promise<unknown> {
  const request = paramsOf(raw);
  const worktreeId = typeof request.worktreeId === "string" ? request.worktreeId : "";
  if (!worktreeId) {
    throw new RpcReplyError("invalid", "worktreeId: string expected");
  }
  const existing = served.get(worktreeId);
  if (existing) {
    await sendProvide(existing);
    return null;
  }
  const host = mostRecentHost();
  if (!host) {
    throw new RpcReplyError("unsupported", "Kit has no window open.");
  }
  let worktree = worktrees.find((candidate) => candidate.id === worktreeId);
  if (!worktree) {
    worktree = (await groveWorktrees()).find((candidate) => candidate.id === worktreeId);
  }
  const name = worktree?.name ?? PathUtils.filename(worktreeId);
  const url = typeof request.url === "string" && request.url ? request.url : "about:blank";
  const tab = host.openWorktreeTab({ id: worktreeId, name }, url);
  await provideTab(tab.linkedBrowser as XULBrowserElement, { id: worktreeId, name });
  return null;
}

// ── The setting ─────────────────────────────────────────────────────────

const prefObserver = {
  observe(): void {
    if (isGroveEnabled()) {
      start();
      return;
    }
    void stop();
  },
};

let initialized = false;

// Starts following the setting; every browser window calls it, the first
// call counts.
export function initGrove(): void {
  if (initialized) {
    return;
  }
  initialized = true;
  Services.prefs.addObserver(GROVE_ENABLED_PREF, prefObserver);
  Services.obs.addObserver({
    observe(): void {
      void stop();
    },
  }, "quit-application");
  if (isGroveEnabled()) {
    start();
  }
}

// For tests: the pid of the Grove Kit is connected to, or null.
export function connectedGrovePid(): number | null {
  return connectedPid;
}
