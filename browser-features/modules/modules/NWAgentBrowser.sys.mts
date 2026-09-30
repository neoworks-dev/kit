// SPDX-License-Identifier: MPL-2.0

// The AI agent's hands: an MCP endpoint on 127.0.0.1 whose `bidi` tool sends
// WebDriver BiDi commands to Kit through a filter (#52), and whose `helper`
// tools run the agent-editable helpers.js through the same filter (#53).
//
// BiDi runs in-process: Kit keeps one WebDriverSession of its own, without
// the Remote Agent's WebSocket server or a remote debugging port. The MCP
// server is the Remote Agent's httpd. Each chat opens its own endpoint (path
// and token), and gets the approval requests for what its agent does.
//
// The filter:
// - lets through only browsingContext, script and input commands, with
//   scripts forced into an agent sandbox and no file uploads;
// - keeps private windows out, and scripts, input and screenshots off pages
//   that aren't http(s);
// - strips the live values of password and card fields, and the site's saved
//   passwords, from what comes back;
// - asks in the sidebar before clicks and key presses on buy / pay / order /
//   delete-style controls or checkout forms, and before scripts while a
//   password or card field is filled.
//
// Known limit: a script can still click or read things within the page (the
// approval covers pages with filled secrets), and screenshots show card
// fields as rendered.

import {
  INSPECT_PAGE,
  INSPECTOR_SANDBOX,
  type PagePoint,
  type PageReport,
  type PageTarget,
} from "../common/NWAgentPage.ts";
import {
  DEFAULT_HELPERS,
  describeAction,
  helperActions,
  helperCall,
  inputSources,
  isHelperName,
} from "../common/NWAgentHelpers.ts";

interface HttpRequest {
  method: string;
  path: string;
  bodyInputStream: nsIInputStream;
  hasHeader(name: string): boolean;
  getHeader(name: string): string;
}

interface HttpResponse {
  processAsync(): void;
  finish(): void;
  setStatusLine(version: string | null, code: number, description: string): void;
  setHeader(name: string, value: string, merge?: boolean): void;
  write(data: string): void;
}

interface HttpServer {
  _start(port: number, host: string): void;
  stop(callback: () => void): void;
  registerPathHandler(
    path: string,
    handler: { handle(request: HttpRequest, response: HttpResponse): void } | null,
  ): void;
  identity: { primaryPort: number; add(scheme: string, host: string, port: number): void };
}

interface BidiSession {
  execute(module: string, command: string, params: unknown): Promise<unknown>;
  destroy(): void;
}

const { HttpServer } = ChromeUtils.importESModule(
  "chrome://remote/content/server/httpd.sys.mjs",
) as { HttpServer: new () => HttpServer };
const { WebDriverSession } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/webdriver/Session.sys.mjs",
) as { WebDriverSession: new (capabilities: object, flags: Set<string>) => BidiSession };
const { NavigableManager } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/NavigableManager.sys.mjs",
) as {
  NavigableManager: {
    getBrowsingContextById(id: string): BrowsingContext | null;
    getIdForBrowsingContext(context: BrowsingContext): string;
    startTracking(): void;
  };
};
const { windowManager } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/WindowManager.sys.mjs",
) as { windowManager: { startTracking(): void } };
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs",
);

// What the chat asks the user.
export interface AgentApproval {
  title: string;
  detail: string;
}

export interface AgentEndpointOptions {
  // The chat's browser window: its selected tab is the one the user means.
  window: Window;
  approve(request: AgentApproval): Promise<boolean>;
  // Stops the agent's turn (the indicator's Stop button).
  stop(): void;
}

export interface AgentEndpoint {
  url: string;
  token: string;
  // Clears the indicator from the tabs the agent worked in.
  release(): void;
  close(): void;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

interface ToolResult {
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
  isError?: boolean;
}

const HOST = "127.0.0.1";
const AGENT_SANDBOX = "kit-agent";
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_TEXT = 60_000;
const REDACTED = "[redacted]";

const BIDI_TOOL: JsonObject = {
  name: "bidi",
  description: [
    "Send one WebDriver BiDi command to Kit, the user's web browser, and get its result.",
    "Available: browsingContext (getTree, navigate, create, close, activate, reload,",
    "traverseHistory, captureScreenshot, locateNodes, handleUserPrompt), script (evaluate,",
    "callFunction, getRealms, disown) and input (performActions, releaseActions).",
    "Start with browsingContext.getTree: top-level contexts come with the tab's title, and",
    "`active: true` marks the tab the user is looking at. Scripts run in a sandbox apart from",
    "the page's own scripts; target them with `target: {context}`. Screenshots come back as",
    "images. Some clicks and key presses (buying, paying, deleting) wait for the user to",
    "approve them in Kit. Values of password and card fields are redacted. For everyday",
    "reading and clicking, the `helper` tool is shorter.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      method: { type: "string", description: 'The BiDi command, e.g. "browsingContext.getTree".' },
      params: { type: "object", description: "The command's parameters." },
    },
    required: ["method"],
  },
};

const HELPERS_FILE = PathUtils.join(PathUtils.profileDir, "neoworks-ai", "helpers.js");
const MAX_HELPERS = 100_000;

const HELPER_TOOLS: JsonObject[] = [
  {
    name: "helper",
    description: [
      "Run one function from Kit's helpers file (see helpers_source) in a tab, and get its",
      "result. Start with snapshot() for a numbered list of what's on screen, then click(n),",
      "type(n, text) or press(key). Helpers that return input actions have Kit perform them as",
      "real clicks and key presses, which may wait for the user's approval.",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        context: {
          type: "string",
          description: "The tab's context id, from browsingContext.getTree. Leave it out for the tab the user is looking at.",
        },
        name: { type: "string", description: 'The helper, e.g. "snapshot".' },
        args: { type: "array", description: "Its arguments (JSON values)." },
      },
      required: ["name"],
    },
  },
  {
    name: "helpers_source",
    description: "Read Kit's helpers file: the functions the `helper` tool runs and what they can return.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "helpers_edit",
    description: [
      "Replace Kit's helpers file with new source, to fix a helper or add the one you're missing.",
      "Read it with helpers_source first and send the whole file. It persists across chats.",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: { source: { type: "string", description: "The whole new helpers.js." } },
      required: ["source"],
    },
  },
];

async function readHelpers(): Promise<string> {
  try {
    return await IOUtils.readUTF8(HELPERS_FILE);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return DEFAULT_HELPERS;
    }
    throw error;
  }
}

async function writeHelpers(source: string): Promise<void> {
  await IOUtils.makeDirectory(PathUtils.parent(HELPERS_FILE) ?? "", { ignoreExisting: true });
  await IOUtils.writeUTF8(HELPERS_FILE, source);
}

// The sidebar's reset: back to the helpers Kit ships.
export async function resetAgentHelpers(): Promise<void> {
  await IOUtils.remove(HELPERS_FILE, { ignoreAbsent: true });
}

// Commands that go through, and whether they need a web page.
const ALLOWED: Record<string, { page: boolean }> = {
  "browsingContext.activate": { page: false },
  "browsingContext.captureScreenshot": { page: true },
  "browsingContext.close": { page: false },
  "browsingContext.create": { page: false },
  "browsingContext.getTree": { page: false },
  "browsingContext.handleUserPrompt": { page: false },
  "browsingContext.locateNodes": { page: true },
  "browsingContext.navigate": { page: false },
  "browsingContext.reload": { page: false },
  "browsingContext.traverseHistory": { page: false },
  "script.callFunction": { page: true },
  "script.disown": { page: true },
  "script.evaluate": { page: true },
  "script.getRealms": { page: false },
  "input.performActions": { page: true },
  "input.releaseActions": { page: true },
};

class Declined extends Error {}

let server: HttpServer | null = null;
let session: BidiSession | null = null;
const endpoints = new Map<string, Endpoint>();

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const status = (error as Error & { status?: string }).status;
    return status ? `${status}: ${error.message}` : error.message;
  }
  return String(error);
}

// Registers BiDi's process actor unless it's there, without the warning
// registerProcessDataActor() logs when it is.
function registerProcessActor(): void {
  try {
    ChromeUtils.registerProcessActor("WebDriverProcessData", {
      child: {
        esModuleURI: "chrome://remote/content/shared/webdriver/process-actors/WebDriverProcessDataChild.sys.mjs",
      },
      includeParent: true,
      safeForUntrustedWebProcess: true,
    } as ProcessActorOptions);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotSupportedError")) {
      throw error;
    }
  }
}

// Kit's own BiDi session, kept for the app's lifetime. Tracking and the
// process actor are shared by every WebDriver session and not counted: when
// another session ends (Marionette in dev) they go away for all, so they're
// set up again before each command.
function bidi(): BidiSession {
  session ??= new WebDriverSession({}, new Set(["bidi"]));
  NavigableManager.startTracking();
  windowManager.startTracking();
  registerProcessActor();
  return session;
}

// UTF-8 as the byte string httpd writes.
function utf8Bytes(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return out;
}

function readBody(request: HttpRequest): string {
  const stream = request.bodyInputStream;
  const available = stream.available();
  return available ? NetUtil.readInputStreamToString(stream, available, { charset: "UTF-8" }) : "";
}

function contextOf(id: unknown): BrowsingContext | null {
  bidi();
  return typeof id === "string" ? NavigableManager.getBrowsingContextById(id) : null;
}

function isPrivate(context: BrowsingContext): boolean {
  return context.usePrivateBrowsing;
}

function isWebUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

function currentUrl(context: BrowsingContext): string {
  return (context as unknown as CanonicalBrowsingContext).currentURI?.spec ?? "";
}

// Frames may be about:blank or srcdoc; the tab itself must be a web page.
function isWebPage(context: BrowsingContext): boolean {
  if (!isWebUrl(currentUrl(context.top))) {
    return false;
  }
  const url = currentUrl(context);
  return isWebUrl(url) || url === "about:blank" || url === "about:srcdoc" ||
    url.startsWith("blob:https://") || url.startsWith("blob:http://");
}

function hostOf(context: BrowsingContext): string {
  try {
    return new URL(currentUrl(context.top)).host;
  } catch {
    return "this page";
  }
}

interface TabElement extends Element {
  label: string;
}

function tabOf(context: BrowsingContext): { browser: XULBrowserElement; tab: TabElement; label: string } | null {
  const browser = context.top.embedderElement as XULBrowserElement | null;
  const gBrowser = (browser?.ownerDocument?.defaultView as
    | (Window & { gBrowser?: { getTabForBrowser(browser: XULBrowserElement): TabElement | null } })
    | undefined)?.gBrowser;
  const tab = browser && gBrowser?.getTabForBrowser(browser);
  return browser && tab ? { browser, tab, label: tab.label } : null;
}

// Tabs the agent is working in carry nw-ai-controlled, and so does their
// .browserContainer, for the indicator (neoworks-ai/control-indicator.tsx and
// the sidebar's tab rows). Cleared when the agent's turn ends.
const CONTROLLED = "nw-ai-controlled";
const tabOwners = new WeakMap<TabElement, Endpoint>();

function setControlled(tab: TabElement, browser: XULBrowserElement, on: boolean): void {
  const container = browser.closest(".browserContainer");
  if (on) {
    tab.setAttribute(CONTROLLED, "true");
    container?.setAttribute(CONTROLLED, "true");
  } else {
    tab.removeAttribute(CONTROLLED);
    container?.removeAttribute(CONTROLLED);
  }
  const view = tab.ownerDocument?.defaultView;
  if (view) {
    tab.dispatchEvent(new view.CustomEvent("TabAttrModified", { bubbles: true, detail: { changed: [CONTROLLED] } }));
  }
}

// The indicator's Stop button: stops the agent working in this tab.
export function stopAgentInTab(tab: Element): void {
  tabOwners.get(tab as TabElement)?.options.stop();
}

// Replaces every secret, as it appears inside JSON strings.
function redact(json: string, secrets: Set<string>): string {
  let out = json;
  for (const secret of secrets) {
    out = out.replaceAll(JSON.stringify(secret).slice(1, -1), REDACTED);
  }
  return out;
}

function textResult(text: string, isError = false): ToolResult {
  const clipped = text.length > MAX_TEXT
    ? `${text.slice(0, MAX_TEXT)}\n[cut: ${text.length - MAX_TEXT} more characters]`
    : text;
  return { content: [{ type: "text", text: clipped }], ...(isError ? { isError } : {}) };
}

// Where a pointer source presses, as a viewport point or an element.
function pressTargets(actions: Json): { points: PagePoint[]; elements: JsonObject[] } {
  const points: PagePoint[] = [];
  const elements: JsonObject[] = [];
  for (const source of Array.isArray(actions) ? actions : []) {
    if (!isObject(source) || source.type !== "pointer" || !Array.isArray(source.actions)) {
      continue;
    }
    let x = 0;
    let y = 0;
    let element: JsonObject | null = null;
    for (const action of source.actions) {
      if (!isObject(action)) {
        continue;
      }
      if (action.type === "pointerMove") {
        const dx = typeof action.x === "number" ? action.x : 0;
        const dy = typeof action.y === "number" ? action.y : 0;
        const origin = action.origin;
        if (isObject(origin) && isObject(origin.element)) {
          element = origin.element;
        } else if (origin === "pointer") {
          x += dx;
          y += dy;
          element = null;
        } else {
          x = dx;
          y = dy;
          element = null;
        }
      } else if (action.type === "pointerDown") {
        if (element) {
          elements.push(element);
        } else {
          points.push({ x, y });
        }
      }
    }
  }
  return { points, elements };
}

function presses(actions: Json, type: "key"): boolean {
  return Array.isArray(actions) &&
    actions.some((source) =>
      isObject(source) && source.type === type && Array.isArray(source.actions) &&
      source.actions.some((action) => isObject(action) && action.type === "keyDown")
    );
}

class Endpoint {
  readonly path: string;
  readonly token: string;
  readonly options: AgentEndpointOptions;
  readonly controlled = new Map<TabElement, XULBrowserElement>();

  control(context: BrowsingContext): void {
    const found = tabOf(context);
    if (!found || this.controlled.has(found.tab)) {
      return;
    }
    tabOwners.get(found.tab)?.controlled.delete(found.tab);
    tabOwners.set(found.tab, this);
    this.controlled.set(found.tab, found.browser);
    setControlled(found.tab, found.browser, true);
  }

  release(): void {
    for (const [tab, browser] of this.controlled) {
      if (tabOwners.get(tab) === this) {
        tabOwners.delete(tab);
        setControlled(tab, browser, false);
      }
    }
    this.controlled.clear();
  }

  constructor(options: AgentEndpointOptions) {
    this.path = `/mcp/${randomHex(8)}`;
    this.token = randomHex(24);
    this.options = options;
  }

  handle(request: HttpRequest, response: HttpResponse): void {
    response.processAsync();
    this.respond(request, response)
      .catch((error: unknown) => {
        console.error("[NWAgentBrowser]", error);
        this.send(response, 500, "Internal Server Error", null);
      })
      .finally(() => response.finish());
  }

  send(response: HttpResponse, code: number, description: string, body: Json | undefined): void {
    response.setStatusLine("1.1", code, description);
    if (body !== undefined && body !== null) {
      response.setHeader("Content-Type", "application/json; charset=utf-8", false);
      response.write(utf8Bytes(JSON.stringify(body)));
    }
  }

  async respond(request: HttpRequest, response: HttpResponse): Promise<void> {
    // Web pages can reach 127.0.0.1 too; they send an Origin and lack the token.
    if (request.hasHeader("Origin")) {
      this.send(response, 403, "Forbidden", null);
      return;
    }
    if (!request.hasHeader("Authorization") || request.getHeader("Authorization") !== `Bearer ${this.token}`) {
      this.send(response, 401, "Unauthorized", null);
      return;
    }
    if (request.method !== "POST") {
      // No server-sent event stream: every answer comes with its request.
      response.setHeader("Allow", "POST", false);
      this.send(response, 405, "Method Not Allowed", null);
      return;
    }

    let message: Json;
    try {
      message = JSON.parse(readBody(request)) as Json;
    } catch {
      this.send(response, 400, "Bad Request", { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    const batch = Array.isArray(message) ? message : [message];
    const replies: Json[] = [];
    for (const entry of batch) {
      const reply = isObject(entry) ? await this.rpc(entry) : null;
      if (reply) {
        replies.push(reply);
      }
    }
    if (replies.length === 0) {
      this.send(response, 202, "Accepted", null);
      return;
    }
    this.send(response, 200, "OK", Array.isArray(message) ? replies : replies[0]);
  }

  // One JSON-RPC message; notifications get no reply.
  async rpc(message: JsonObject): Promise<JsonObject | null> {
    const id = message.id;
    if (id === undefined) {
      return null;
    }
    const params = isObject(message.params) ? message.params : {};
    const ok = (result: Json) => ({ jsonrpc: "2.0", id, result });
    switch (message.method) {
      case "initialize": {
        const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
        return ok({
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "kit", version: "1" },
        });
      }
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: [BIDI_TOOL, ...HELPER_TOOLS] });
      case "tools/call": {
        const name = String(params.name);
        if (![BIDI_TOOL, ...HELPER_TOOLS].some((tool) => tool.name === name)) {
          return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${name}` } };
        }
        const args = isObject(params.arguments) ? params.arguments : {};
        return ok(await this.call(name, args) as unknown as Json);
      }
      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${String(message.method)}` } };
    }
  }

  async call(tool: string, args: JsonObject): Promise<ToolResult> {
    try {
      switch (tool) {
        case "helper":
          return await this.runHelper(args);
        case "helpers_source":
          return textResult(await readHelpers());
        case "helpers_edit":
          return await this.editHelpers(args);
        default: {
          const method = typeof args.method === "string" ? args.method : "";
          const params = isObject(args.params) ? { ...args.params } : {};
          return await this.run(method, params);
        }
      }
    } catch (error) {
      if (error instanceof Declined) {
        return textResult(`The user declined: ${error.message}`, true);
      }
      return textResult(errorText(error), true);
    }
  }

  async editHelpers(args: JsonObject): Promise<ToolResult> {
    const source = typeof args.source === "string" ? args.source : "";
    if (!source.trim()) {
      throw new Error("Send the whole helpers file as `source`.");
    }
    if (source.length > MAX_HELPERS) {
      throw new Error(`The helpers file is limited to ${MAX_HELPERS} characters.`);
    }
    await writeHelpers(source);
    return textResult("Saved. Syntax errors show up when a helper runs.");
  }

  // The context id of the tab selected in the chat's window.
  activeContext(): string {
    const browser = (this.options.window as Window & { gBrowser?: { selectedBrowser: XULBrowserElement } })
      .gBrowser?.selectedBrowser;
    const context = browser?.browsingContext;
    if (!context) {
      throw new Error("No tab is selected; pass a context from browsingContext.getTree.");
    }
    bidi();
    return NavigableManager.getIdForBrowsingContext(context);
  }

  // Runs a helper in the page, then performs the input it hands back.
  async runHelper(args: JsonObject): Promise<ToolResult> {
    const name = typeof args.name === "string" ? args.name : "";
    if (!isHelperName(name)) {
      throw new Error("`name` must be the name of a function in the helpers file.");
    }
    const context = typeof args.context === "string" && args.context ? args.context : this.activeContext();
    const helperArgs = Array.isArray(args.args) ? args.args : [];
    const { result, secrets } = await this.filtered("script.callFunction", {
      functionDeclaration: helperCall(await readHelpers(), name),
      target: { context },
      arguments: [{ type: "string", value: JSON.stringify(helperArgs) }],
      awaitPromise: true,
    });
    if (!isObject(result) || result.type !== "success") {
      const details = isObject(result) && isObject(result.exceptionDetails) ? result.exceptionDetails.text : result;
      return textResult(redact(`${name} failed: ${typeof details === "string" ? details : JSON.stringify(details)}`, secrets), true);
    }
    const value = isObject(result.result) && typeof result.result.value === "string" ? result.result.value : "null";
    const returned: unknown = JSON.parse(value);
    const actions = helperActions(returned);
    if (!actions) {
      return textResult(redact(typeof returned === "string" ? returned : JSON.stringify(returned, null, 1), secrets));
    }
    const done: string[] = [];
    for (const action of actions) {
      await this.filtered("input.performActions", { context, actions: inputSources(action) as Json[] });
      done.push(describeAction(action));
    }
    return textResult(`Done: ${done.join(", ")}.`);
  }

  async run(method: string, params: JsonObject): Promise<ToolResult> {
    const { result, secrets } = await this.filtered(method, params);
    if (method === "browsingContext.captureScreenshot" && isObject(result) && typeof result.data === "string") {
      return { content: [{ type: "image", data: result.data, mimeType: "image/png" }] };
    }
    const shown = method === "browsingContext.getTree"
      ? this.annotateTree(result)
      : method === "script.getRealms"
      ? this.withoutPrivateRealms(result)
      : result;
    return textResult(redact(JSON.stringify(shown ?? null), secrets));
  }

  // One BiDi command through the filter, with the secrets to redact from it.
  async filtered(method: string, params: JsonObject): Promise<{ result: unknown; secrets: Set<string> }> {
    const rule = ALLOWED[method];
    if (!rule) {
      throw new Error(`${method || "(no method)"} isn't available. Allowed: ${Object.keys(ALLOWED).join(", ")}`);
    }
    const [module, command] = method.split(".");

    if (module === "script" && command !== "getRealms") {
      if (isObject(params.target) && params.target.realm !== undefined) {
        throw new Error("Target scripts with {context}, not {realm}.");
      }
    }
    if (method === "script.evaluate" || method === "script.callFunction") {
      const target = isObject(params.target) ? params.target : {};
      params.target = { context: target.context ?? null, sandbox: AGENT_SANDBOX };
    }
    if (method === "browsingContext.navigate" && !isWebUrl(String(params.url ?? ""))) {
      throw new Error("Only http and https pages can be opened.");
    }

    const contextId = method.startsWith("script.")
      ? (isObject(params.target) ? params.target.context : undefined)
      : method === "browsingContext.create"
      ? params.referenceContext
      : params.context;
    const context = contextOf(contextId);
    if (contextId !== undefined && contextId !== null) {
      if (!context) {
        throw new Error(`no such frame: ${String(contextId)}`);
      }
      if (isPrivate(context)) {
        throw new Error("Private windows are off limits.");
      }
      if (rule.page && !isWebPage(context)) {
        throw new Error(`Only web pages can be read or used; this is ${currentUrl(context) || "an empty page"}.`);
      }
    }

    if (context) {
      this.control(context);
    }
    const secrets = new Set<string>();
    if (context && rule.page && command !== "releaseActions" && command !== "disown") {
      await this.check(method, params, context, secrets);
    }

    const result = await bidi().execute(module, command, params);
    if (method === "browsingContext.create" && isObject(result)) {
      const created = contextOf(result.context);
      if (created) {
        this.control(created);
      }
    }

    return { result, secrets };
  }

  // Inspects the page, collects its secrets and asks the user when needed.
  async check(method: string, params: JsonObject, context: BrowsingContext, secrets: Set<string>): Promise<void> {
    const press = method === "input.performActions" ? pressTargets(params.actions ?? null) : { points: [], elements: [] };
    const report = await this.inspect(context, press.points, press.elements);
    for (const secret of report.secrets) {
      secrets.add(secret);
    }
    for (const secret of await this.savedPasswords(context)) {
      secrets.add(secret);
    }

    const host = hostOf(context);
    if (method === "script.evaluate" || method === "script.callFunction") {
      if (report.secrets.length > 0) {
        await this.ask({
          title: `Run a script on ${host}?`,
          detail: "The page has a filled password or card field.",
        });
      }
      return;
    }
    if (method === "input.performActions") {
      const clicked = report.targets.find((target): target is PageTarget => !!target && (target.risky || target.checkout));
      if (clicked) {
        await this.ask({
          title: `Click “${clicked.label || "a button"}” on ${host}?`,
          detail: clicked.checkout ? "It's part of a checkout form." : "It may buy, pay, order, subscribe or delete something.",
        });
        return;
      }
      const focus = report.focus;
      if (presses(params.actions ?? null, "key") && focus && (focus.risky || focus.checkout)) {
        await this.ask({
          title: `Type into “${focus.label || "a field"}” on ${host}?`,
          detail: focus.checkout ? "It's part of a checkout form." : "It may buy, pay, order, subscribe or delete something.",
        });
      }
    }
  }

  async inspect(context: BrowsingContext, points: PagePoint[], elements: JsonObject[]): Promise<PageReport> {
    const result = await bidi().execute("script", "callFunction", {
      functionDeclaration: INSPECT_PAGE,
      target: { context: NavigableManager.getIdForBrowsingContext(context), sandbox: INSPECTOR_SANDBOX },
      arguments: [
        { type: "array", value: points.map((point) => ({ type: "object", value: [["x", { type: "number", value: point.x }], ["y", { type: "number", value: point.y }]] })) },
        ...elements.map((element) => ({ sharedId: String(element.sharedId ?? "") })),
      ],
      awaitPromise: false,
    });
    if (isObject(result) && result.type === "success" && isObject(result.result) && typeof result.result.value === "string") {
      return JSON.parse(result.result.value) as PageReport;
    }
    // A page that can't be inspected is treated as risky.
    const exception = isObject(result) && isObject(result.exceptionDetails) ? String(result.exceptionDetails.text) : "unknown";
    throw new Error(`Kit couldn't check this page before acting (${exception}).`);
  }

  async savedPasswords(context: BrowsingContext): Promise<string[]> {
    try {
      const origin = new URL(currentUrl(context.top)).origin;
      const logins: { password: string }[] = await Services.logins.searchLoginsAsync({ origin });
      return logins.map((login) => login.password).filter((password) => password.length >= 3);
    } catch (error) {
      console.error("[NWAgentBrowser] Couldn't read saved logins:", error);
      return [];
    }
  }

  async ask(request: AgentApproval): Promise<void> {
    if (!(await this.options.approve(request))) {
      throw new Declined(request.title);
    }
  }

  // Drops private windows and adds each tab's title, and which one is active.
  annotateTree(result: unknown): unknown {
    if (!isObject(result) || !Array.isArray(result.contexts)) {
      return result;
    }
    const selected = (this.options.window as Window & { gBrowser?: { selectedBrowser: XULBrowserElement } }).gBrowser?.selectedBrowser;
    const contexts = result.contexts.flatMap((entry) => {
      if (!isObject(entry)) {
        return [];
      }
      const context = contextOf(entry.context);
      if (!context || isPrivate(context)) {
        return [];
      }
      const tab = tabOf(context);
      return [{
        ...entry,
        ...(tab ? { title: tab.label } : {}),
        ...(tab && tab.browser === selected ? { active: true } : {}),
      }];
    });
    return { ...result, contexts };
  }

  withoutPrivateRealms(result: unknown): unknown {
    if (!isObject(result) || !Array.isArray(result.realms)) {
      return result;
    }
    const realms = result.realms.filter((realm) => {
      const context = isObject(realm) ? contextOf(realm.context) : null;
      return context !== null && !isPrivate(context);
    });
    return { ...result, realms };
  }
}

function ensureServer(): HttpServer {
  if (!server) {
    const started = new HttpServer();
    started._start(-1, HOST);
    // Bound to 127.0.0.1, httpd only answers to Host: localhost. Any other
    // Host (a rebound DNS name) still gets a 400.
    started.identity.add("http", HOST, started.identity.primaryPort);
    server = started;
    Services.obs.addObserver(quitObserver, "quit-application");
  }
  return server;
}

const quitObserver = {
  observe(): void {
    server?.stop(() => {});
    server = null;
    session?.destroy();
    session = null;
    endpoints.clear();
  },
};

// A new endpoint for one chat; close it when the chat ends.
export function openAgentEndpoint(options: AgentEndpointOptions): AgentEndpoint {
  const httpServer = ensureServer();
  const endpoint = new Endpoint(options);
  endpoints.set(endpoint.path, endpoint);
  httpServer.registerPathHandler(endpoint.path, endpoint);
  return {
    url: `http://${HOST}:${httpServer.identity.primaryPort}${endpoint.path}`,
    token: endpoint.token,
    release: () => endpoint.release(),
    close() {
      endpoint.release();
      if (endpoints.delete(endpoint.path)) {
        server?.registerPathHandler(endpoint.path, null);
      }
    },
  };
}
