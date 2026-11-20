// SPDX-License-Identifier: MPL-2.0

// Kit's line to the companion: the one agent the shared harness daemon
// (`neoworks-harness serve --shared`, from switchboard) runs for all of the
// user's apps. Kit attaches as one app for the whole process, with its
// browser tool (an NWAgentBrowser endpoint) and its manual as the skill the
// agent gets on its first visit. The desktop overlay moves the agent here
// when the user rambles about a Kit window; then the window the user was in
// shows it at work (neoworks-ai/companion.ts), until it goes elsewhere.
//
// The daemon says where it listens in $XDG_RUNTIME_DIR/neoworks/harness.json.
// It speaks JSON-RPC over a WebSocket. Methods: switchboard
// src/shared/companion-wire.ts.

const { setTimeout, clearTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs",
) as { setTimeout: typeof globalThis.setTimeout; clearTimeout: typeof globalThis.clearTimeout };

// Under $XDG_RUNTIME_DIR; PathUtils.join takes one segment per argument.
const DAEMON_FILE = ["neoworks", "harness.json"];
const RETRY_MS = 5000;
const ACP_PROTOCOL_VERSION = 1;

const METHODS = {
  attach: "_neoworks/companion/attach",
  prompt: "_neoworks/companion/prompt",
  move: "_neoworks/companion/move",
  cancel: "_neoworks/companion/cancel",
  reset: "_neoworks/companion/reset",
  entry: "_neoworks/companion/entry",
  surfaces: "_neoworks/companion/surfaces",
  permission: "_neoworks/companion/permission",
} as const;

export interface Skill {
  name: string;
  description: string;
  instructions: string;
}

export interface Surface {
  id: string;
  app: string;
  pid: number;
  title?: string;
  ambient?: boolean;
}

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: string;
}

export interface PermissionRequest {
  toolCall: { toolCallId: string; title?: string | null; _meta?: { claudeCode?: { toolName?: string } } | null };
  options: PermissionOption[];
}

// One thing that happened in the shared conversation. Turn events are ACP
// session updates and the harness's own events; the window reads what it
// draws from them.
export type CompanionEntry =
  | { kind: "user"; from: string; content: ContentBlock[]; display?: unknown }
  | { kind: "event"; event: { type: string; update?: unknown } }
  | { kind: "turn"; running: boolean }
  | { kind: "moved"; here: string | null; from: string | null; reason: "ramble" | "user" | "detached" }
  | { kind: "error"; message: string }
  // The agent was given the skill of the app `from`; once per conversation.
  | { kind: "skill"; name: string; from: string }
  | { kind: "reset" };

export type ContentBlock = { type: "text"; text: string } | { type: string; [key: string]: unknown };

export type CompanionConnection = "connecting" | "ready" | "absent";

export interface CompanionState {
  connection: CompanionConnection;
  surfaceId: string | null;
  // Where the agent is: a surface id, or null on the desktop.
  here: string | null;
  // The Kit window it works in while it's here.
  window: Window | null;
  // The overlay is attached, so a move here shows as a drop onto the window.
  overlay: boolean;
  running: boolean;
}

// What the agent asks while it works in Kit: the harness's permission for a
// tool, or Kit's own approval for an action in a page (NWAgentBrowser).
export type CompanionQuestion =
  | { kind: "permission"; title: string; canAllow: boolean }
  | { kind: "approval"; title: string; detail: string };

export type CompanionAsk = CompanionQuestion & { id: number };

// A window showing the companion.
export interface CompanionView {
  state(state: CompanionState): void;
  // `live` is false for the conversation so far, replayed to a window that starts watching or after a reconnect.
  entry(entry: CompanionEntry, live: boolean): void;
  ask(ask: CompanionAsk): void;
  answered(id: number): void;
}

interface AgentEndpoint {
  url: string;
  token: string;
  release(): void;
  close(): void;
}

interface AgentBrowserModule {
  openAgentEndpoint(options: {
    readonly window: Window;
    approve(request: { title: string; detail: string }): Promise<boolean>;
    stop(): void;
  }): AgentEndpoint;
}

type RpcId = number | string;

interface RpcMessage {
  jsonrpc: "2.0";
  id?: RpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

interface Attached {
  surfaceId: string;
  here: string | null;
  running: boolean;
  surfaces: Surface[];
  history: CompanionEntry[];
}

const views = new Set<CompanionView>();
const pendingAsks = new Map<number, (answer: boolean) => void>();
let nextAsk = 0;

let skill: Skill | null = null;
let socket: RpcSocket | null = null;
let endpoint: AgentEndpoint | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let history: CompanionEntry[] = [];
let surfaces: Surface[] = [];
let state: CompanionState = {
  connection: "connecting",
  surfaceId: null,
  here: null,
  window: null,
  overlay: false,
  running: false,
};

// Shows the companion in a window: its state and the conversation so far
// right away, then what happens. The first window starts the connection,
// with Kit's manual as the agent's skill here. Returns the remover.
export function watchCompanion(view: CompanionView, kitSkill: Skill): () => void {
  skill = kitSkill;
  views.add(view);
  view.state(state);
  for (const entry of history) {
    view.entry(entry, false);
  }
  if (socket === null && retry === null) {
    void connect();
  }
  return () => {
    views.delete(view);
  };
}

export async function sendToCompanion(text: string): Promise<void> {
  await call(METHODS.prompt, { content: [{ type: "text", text }] });
}

export async function cancelCompanion(): Promise<void> {
  declineAsks();
  await call(METHODS.cancel, {});
}

// The user sends the agent out of Kit, back onto the desktop.
export async function sendCompanionAway(): Promise<void> {
  await call(METHODS.move, { to: null, reason: "user" });
}

// The user calls the agent into the window they're in.
export async function callCompanionHere(window: Window): Promise<void> {
  if (state.surfaceId === null) {
    return;
  }
  setState({ window });
  await call(METHODS.move, { to: state.surfaceId, reason: "user" });
}

export async function resetCompanion(): Promise<void> {
  declineAsks();
  await call(METHODS.reset, {});
}

export function answerAsk(id: number, allowed: boolean): void {
  const resolve = pendingAsks.get(id);
  if (!resolve) {
    return;
  }
  pendingAsks.delete(id);
  resolve(allowed);
  for (const view of views) {
    view.answered(id);
  }
}

function call(method: string, params: unknown): Promise<unknown> {
  if (socket === null || state.surfaceId === null) {
    return Promise.reject(new Error("The companion isn't running (systemctl --user start neoworks-harness)."));
  }
  return socket.request(method, params);
}

function setState(patch: Partial<CompanionState>): void {
  state = { ...state, ...patch };
  for (const view of views) {
    view.state(state);
  }
}

function record(entry: CompanionEntry, live = true): void {
  if (entry.kind === "reset") {
    history = [];
  }
  history.push(entry);
  for (const view of views) {
    view.entry(entry, live);
  }
}

// ── connecting ────────────────────────────────────────────────────────────

async function daemonAddress(): Promise<{ url: string; token: string } | null> {
  const runtime = Services.env.get("XDG_RUNTIME_DIR");
  if (!runtime) {
    return null;
  }
  const path = PathUtils.join(runtime, ...DAEMON_FILE);
  try {
    const file = await IOUtils.readJSON(path) as { url?: unknown; token?: unknown };
    if (typeof file.url === "string" && typeof file.token === "string") {
      return { url: file.url, token: file.token };
    }
  } catch {
    // No daemon has said where it is.
  }
  return null;
}

async function connect(): Promise<void> {
  retry = null;
  setState({ connection: "connecting" });
  const address = await daemonAddress();
  if (address === null) {
    absent();
    return;
  }
  const url = new URL(address.url);
  url.searchParams.set("token", address.token);
  const opened = new RpcSocket(url.toString(), onRequest, onNotification, () => {
    if (socket === opened) {
      socket = null;
      absent();
    }
  });
  socket = opened;
  try {
    await opened.open();
    await opened.request("initialize", {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: { name: "kit", version: "0.1.0" },
    });
    const attached = await opened.request(METHODS.attach, surfaceInfo()) as Attached;
    // Windows still showing the conversation from before a reconnect start over with it.
    record({ kind: "reset" }, false);
    for (const entry of attached.history) {
      record(entry, false);
    }
    surfaces = attached.surfaces;
    let window: Window | null = null;
    if (attached.here === attached.surfaceId) {
      window = latestWindow();
    }
    setState({
      connection: "ready",
      surfaceId: attached.surfaceId,
      here: attached.here,
      window,
      overlay: hasOverlay(attached.surfaces),
      running: attached.running,
    });
  } catch (error) {
    console.error("[NWCompanion] Couldn't attach to the companion:", error);
    opened.close();
  }
}

// The daemon isn't there (yet); look again in a while.
function absent(): void {
  declineAsks();
  setState({ connection: "absent", surfaceId: null, running: false });
  if (retry !== null || views.size === 0) {
    return;
  }
  retry = setTimeout(() => void connect(), RETRY_MS);
}

function surfaceInfo(): Record<string, unknown> {
  const browserTool = agentEndpoint();
  const info: Record<string, unknown> = {
    app: "kit",
    pid: Services.appinfo.processID,
    title: "Kit",
    mcp: {
      type: "http",
      name: "kit",
      url: browserTool.url,
      headers: [{ name: "Authorization", value: `Bearer ${browserTool.token}` }],
    },
  };
  if (skill !== null) {
    info.skill = skill;
  }
  return info;
}

// Kit's browser tool for the companion, kept for the whole session: it works
// in whichever window the agent is in.
function agentEndpoint(): AgentEndpoint {
  if (endpoint === null) {
    const { openAgentEndpoint } = ChromeUtils.importESModule(
      "resource://noraneko/modules/NWAgentBrowser.sys.mjs",
    ) as AgentBrowserModule;
    endpoint = openAgentEndpoint({
      get window(): Window {
        return workingWindow();
      },
      approve: (request) => ask({ kind: "approval", title: request.title, detail: request.detail }),
      stop: () => void cancelCompanion(),
    });
  }
  return endpoint;
}

// The window the agent works in: the one it came to, else the user's latest.
function workingWindow(): Window {
  if (state.window !== null && !state.window.closed) {
    return state.window;
  }
  const latest = latestWindow();
  if (latest === null) {
    throw new Error("Kit has no window open.");
  }
  return latest;
}

// The browser window the user was in last, private ones aside.
function latestWindow(): Window | null {
  const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  ) as { PrivateBrowsingUtils: { isWindowPrivate(window: Window): boolean } };
  const recent = Services.wm.getMostRecentWindow("navigator:browser") as Window | null;
  if (recent !== null && !PrivateBrowsingUtils.isWindowPrivate(recent)) {
    return recent;
  }
  for (const candidate of Services.wm.getEnumerator("navigator:browser")) {
    const window = candidate as Window;
    if (!PrivateBrowsingUtils.isWindowPrivate(window)) {
      return window;
    }
  }
  return null;
}

function hasOverlay(list: Surface[]): boolean {
  return list.some((surface) => surface.app === "overlay");
}

// ── what the daemon sends ─────────────────────────────────────────────────

function onNotification(method: string, params: unknown): void {
  if (method === METHODS.entry) {
    onEntry((params as { entry: CompanionEntry }).entry);
    return;
  }
  if (method === METHODS.surfaces) {
    surfaces = (params as { surfaces: Surface[] }).surfaces;
    setState({ overlay: hasOverlay(surfaces) });
  }
}

function onEntry(entry: CompanionEntry): void {
  if (entry.kind === "moved") {
    if (entry.here !== null && entry.here === state.surfaceId) {
      // Called into a window (callCompanionHere), or rambled about the one the user was in last.
      let window = state.window;
      if (window === null || window.closed) {
        window = latestWindow();
      }
      setState({ here: entry.here, window });
    } else {
      declineAsks();
      endpoint?.release();
      setState({ here: entry.here, window: null });
    }
  }
  if (entry.kind === "turn") {
    setState({ running: entry.running });
    if (!entry.running) {
      // The tabs it worked in lose their indicator; the window keeps its frame while it's here.
      endpoint?.release();
    }
  }
  record(entry);
}

async function onRequest(method: string, params: unknown): Promise<unknown> {
  if (method !== METHODS.permission) {
    throw new Error(`Kit doesn't answer ${method}`);
  }
  const request = (params as { request: PermissionRequest }).request;
  // Kit's browser tool asks the user itself before anything that needs it.
  if (isKitTool(request)) {
    return responseFor(request, true);
  }
  const allowed = await ask({ kind: "permission", title: request.toolCall.title ?? "Use a tool", canAllow: allowOption(request) !== undefined });
  return responseFor(request, allowed);
}

function isKitTool(request: PermissionRequest): boolean {
  const names = [request.toolCall._meta?.claudeCode?.toolName, request.toolCall.title];
  return names.some((name) => typeof name === "string" && name.startsWith("mcp__kit__"));
}

function allowOption(request: PermissionRequest): PermissionOption | undefined {
  return request.options.find((option) => option.kind === "allow_once") ??
    request.options.find((option) => option.kind === "allow_always");
}

function responseFor(request: PermissionRequest, allowed: boolean): unknown {
  let option = allowOption(request);
  if (!allowed) {
    option = request.options.find((candidate) => candidate.kind === "reject_once") ??
      request.options.find((candidate) => candidate.kind === "reject_always");
  }
  if (!option) {
    return { outcome: { outcome: "cancelled" } };
  }
  return { outcome: { outcome: "selected", optionId: option.optionId } };
}

// Shows a question in every window with the companion, and waits for one to answer.
function ask(question: CompanionQuestion): Promise<boolean> {
  if (views.size === 0) {
    return Promise.resolve(false);
  }
  nextAsk++;
  const id = nextAsk;
  const full: CompanionAsk = { ...question, id };
  return new Promise((resolve) => {
    pendingAsks.set(id, resolve);
    for (const view of views) {
      view.ask(full);
    }
  });
}

function declineAsks(): void {
  for (const id of [...pendingAsks.keys()]) {
    answerAsk(id, false);
  }
}

// ── the socket ────────────────────────────────────────────────────────────

// A system module has no WebSocket of its own (and Kit's Gecko won't create
// a bare nsIWebSocketChannel); a sandbox with the system principal lends one.
function webSocketClass(): typeof WebSocket {
  const sandbox = Cu.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), {
    wantGlobalProperties: ["WebSocket"],
  }) as { WebSocket: typeof WebSocket };
  return sandbox.WebSocket;
}

// JSON-RPC 2.0 over a WebSocket, one message per text frame.
class RpcSocket {
  readonly #url: string;
  readonly #onRequest: (method: string, params: unknown) => Promise<unknown>;
  readonly #onNotification: (method: string, params: unknown) => void;
  readonly #onClose: () => void;
  readonly #waiting = new Map<RpcId, { resolve(value: unknown): void; reject(error: Error): void }>();
  #socket: WebSocket | null = null;
  #nextId = 0;
  #open = false;
  #closed = false;
  #opened: { resolve(): void; reject(error: Error): void } | null = null;

  constructor(
    url: string,
    onRequest: (method: string, params: unknown) => Promise<unknown>,
    onNotification: (method: string, params: unknown) => void,
    onClose: () => void,
  ) {
    this.#url = url;
    this.#onRequest = onRequest;
    this.#onNotification = onNotification;
    this.#onClose = onClose;
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#opened = { resolve, reject };
      const Socket = webSocketClass();
      const socket = new Socket(this.#url);
      this.#socket = socket;
      socket.addEventListener("open", () => {
        this.#open = true;
        this.#opened?.resolve();
        this.#opened = null;
      });
      socket.addEventListener("message", (event: MessageEvent) => this.#receive(String(event.data)));
      socket.addEventListener("close", () => this.#ended());
      socket.addEventListener("error", () => this.#ended());
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    this.#nextId++;
    const id = this.#nextId;
    return new Promise((resolve, reject) => {
      this.#waiting.set(id, { resolve, reject });
      this.#send({ jsonrpc: "2.0", id, method, params });
    });
  }

  close(): void {
    if (this.#open && !this.#closed) {
      this.#socket?.close(1000);
    }
    this.#ended();
  }

  #send(message: RpcMessage): void {
    if (!this.#open || this.#closed) {
      const waiting = message.id === undefined ? undefined : this.#waiting.get(message.id);
      waiting?.reject(new Error("The companion connection is closed."));
      return;
    }
    this.#socket?.send(JSON.stringify(message));
  }

  #receive(text: string): void {
    let message: RpcMessage;
    try {
      message = JSON.parse(text) as RpcMessage;
    } catch {
      console.error("[NWCompanion] The daemon sent something that isn't JSON.");
      return;
    }
    if (message.method === undefined) {
      this.#settle(message);
      return;
    }
    if (message.id === undefined) {
      this.#onNotification(message.method, message.params);
      return;
    }
    const id = message.id;
    this.#onRequest(message.method, message.params).then(
      (result) => this.#send({ jsonrpc: "2.0", id, result: result ?? null }),
      (error: unknown) => this.#send({ jsonrpc: "2.0", id, error: { code: -32603, message: String(error) } }),
    );
  }

  #settle(message: RpcMessage): void {
    if (message.id === undefined) {
      return;
    }
    const waiting = this.#waiting.get(message.id);
    this.#waiting.delete(message.id);
    if (message.error) {
      waiting?.reject(new Error(message.error.message));
      return;
    }
    waiting?.resolve(message.result);
  }

  #ended(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#open = false;
    this.#opened?.reject(new Error("The companion daemon refused the connection."));
    this.#opened = null;
    for (const waiting of this.#waiting.values()) {
      waiting.reject(new Error("The companion connection closed."));
    }
    this.#waiting.clear();
    this.#onClose();
  }
}

// Kit quitting: the daemon notices the socket close and the agent leaves.
Services.obs.addObserver({
  observe(): void {
    if (retry !== null) {
      clearTimeout(retry);
      retry = null;
    }
    views.clear();
    socket?.close();
    endpoint?.close();
    endpoint = null;
  },
}, "quit-application");
