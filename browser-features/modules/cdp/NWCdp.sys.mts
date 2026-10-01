// SPDX-License-Identifier: MPL-2.0

// Kit's CDP engine: answers Chrome DevTools Protocol commands for one tab
// with Gecko's own machinery, and turns what happens in the tab into CDP
// events. It knows nothing about who asks: Grove's socket (NWGrove.sys.mts)
// is one transport over it, Kit's own agent can be another.
//
//   const engine = createCdpEngine();
//   await engine.handle(browser, "Runtime.evaluate", { expression: "1 + 1" });
//   const stop = engine.subscribe(browser, (event) => …);
//
// A target is a tab's <browser>. Commands go through an in-process WebDriver
// BiDi session (as NWAgentBrowser.sys.mts does), which already does what CDP
// needs: scripts in the page's own realm, trusted input dispatched in the
// page's process, navigation that waits for the new document, and console
// and network events. Screenshots are WindowGlobalParent.drawSnapshot, as
// Firefox's own CDP took them, scaled down to a width an agent can use.
//
// Firefox shipped a CDP implementation until Firefox 129 (remote/cdp/); the
// mapping of RemoteObjects, input and screenshots follows it. It ran on its
// own content-process domains; this engine runs on BiDi instead, which is
// still maintained.
//
// Only web pages are touched: no private windows, and scripts, input and
// screenshots only on http(s), file and about:blank pages, never on Kit's or
// Firefox's privileged pages.

import { BIDI_EVENTS, eventContext, toCdpEvents } from "./events.ts";
import { InputError, insertTextSources, keyEventSources, mouseEventSources } from "./input.ts";
import { toExceptionDetails, toRemoteObject } from "./remote-object.ts";
import type { BidiInputSource, BidiRemoteValue, CdpEventMessage, JsonObject } from "./types.ts";

export type { CdpEventMessage } from "./types.ts";

// JSON-RPC error codes, as Chrome answers them.
export const CDP_METHOD_NOT_FOUND = -32601;
export const CDP_INVALID_PARAMS = -32602;
export const CDP_SERVER_ERROR = -32000;

export class CdpError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export type CdpTarget = XULBrowserElement;
export type CdpListener = (event: CdpEventMessage) => void;

export interface CdpEngineOptions {
  // Screenshots wider than this many pixels are scaled down to it.
  maxScreenshotWidth?: number;
}

export interface CdpEngine {
  // One CDP command for the tab; rejects with a CdpError.
  handle(target: CdpTarget, method: string, params: JsonObject): Promise<JsonObject>;
  // Calls `listener` with the tab's CDP events until the returned function
  // is called.
  subscribe(target: CdpTarget, listener: CdpListener): () => void;
  // Drops every subscription and listener. The BiDi session stays: it's
  // Kit's for the app's lifetime (see bidi()).
  destroy(): void;
}

interface BidiSession {
  id: string;
  execute(module: string, command: string, params: unknown): Promise<unknown>;
  messageHandler: {
    on(name: string, listener: (name: string, event: { name: string; data: unknown }) => void): void;
    off(name: string, listener: (name: string, event: { name: string; data: unknown }) => void): void;
  };
}

const { WebDriverSession } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/webdriver/Session.sys.mjs",
) as { WebDriverSession: new (capabilities: object, flags: Set<string>) => BidiSession };
const { NavigableManager } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/NavigableManager.sys.mjs",
) as {
  NavigableManager: {
    getBrowsingContextById(id: string): BrowsingContext | null;
    getIdForBrowser(browser: XULBrowserElement): string;
    startTracking(): void;
  };
};
const { windowManager } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/WindowManager.sys.mjs",
) as { windowManager: { startTracking(): void } };
const { keyData } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/webdriver/KeyData.sys.mjs",
) as { keyData: { getData(key: string): { key: string; code?: string; printable: boolean } } };

const DEFAULT_MAX_SCREENSHOT_WIDTH = 1280;
const SCREENSHOT_FORMATS = new Set(["png", "jpeg", "webp"]);
const PROTOCOL_EVENT = "message-handler-protocol-event";

// Domains a client enables before use. Kit sends their events to whoever
// subscribed, enabled or not, so these only answer.
const NO_OPS = new Set([
  "Page.enable",
  "Page.disable",
  "Runtime.enable",
  "Runtime.disable",
  "Network.enable",
  "Network.disable",
  "Log.enable",
  "Log.disable",
  "DOM.enable",
  "DOM.disable",
]);

function isPageUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://") ||
    url === "about:blank";
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

let keyNames: Map<string, string> | null = null;

// CDP key names and codes → WebDriver's code points for keys that aren't
// text (U+E000–U+E05D), read from the Remote Agent's own key table.
function lookupKey(name: string): string | null {
  if (!keyNames) {
    keyNames = new Map();
    for (let codePoint = 0xe000; codePoint <= 0xe05d; codePoint++) {
      const value = String.fromCharCode(codePoint);
      const data = keyData.getData(value);
      if (data.printable) {
        continue;
      }
      for (const alias of [data.code, data.key]) {
        if (alias && !keyNames.has(alias)) {
          keyNames.set(alias, value);
        }
      }
    }
  }
  return keyNames.get(name) ?? null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function stringParam(params: JsonObject, name: string): string {
  const value = params[name];
  if (typeof value !== "string") {
    throw new CdpError(CDP_INVALID_PARAMS, `${name}: string expected`);
  }
  return value;
}

let session: BidiSession | null = null;

// The BiDi session every engine shares, kept for the app's lifetime: ending a
// WebDriver session stops navigable tracking and unregisters the process
// actor for every other session too (Marionette's in dev, NWAgentBrowser's).
// For the same reason tracking and the actor are set up again before each
// command, in case another session ended.
function bidi(): BidiSession {
  session ??= new WebDriverSession({}, new Set(["bidi"]));
  NavigableManager.startTracking();
  windowManager.startTracking();
  registerProcessActor();
  return session;
}

class Engine implements CdpEngine {
  readonly #maxScreenshotWidth: number;
  #listening = false;
  // Per target: who listens, and the BiDi subscription that feeds them.
  readonly #listeners = new Map<CdpTarget, { listeners: Set<CdpListener>; subscription: Promise<string | null> }>();
  #exceptionCounter = 0;

  constructor(options: CdpEngineOptions) {
    this.#maxScreenshotWidth = options.maxScreenshotWidth ?? DEFAULT_MAX_SCREENSHOT_WIDTH;
  }

  // The shared session, with this engine listening to its events.
  #bidi(): BidiSession {
    const shared = bidi();
    if (!this.#listening) {
      shared.messageHandler.on(PROTOCOL_EVENT, this.#onBidiEvent);
      this.#listening = true;
    }
    return shared;
  }

  async #execute(module: string, command: string, params: unknown): Promise<unknown> {
    try {
      return await this.#bidi().execute(module, command, params);
    } catch (error) {
      throw new CdpError(CDP_SERVER_ERROR, errorMessage(error));
    }
  }

  // The target's BiDi context id, once it's checked to be a tab Kit may drive.
  #context(target: CdpTarget, needsPage: boolean): string {
    const browsingContext = target.browsingContext;
    if (!browsingContext || !target.isConnected) {
      throw new CdpError(CDP_SERVER_ERROR, "The tab is gone.");
    }
    if (browsingContext.usePrivateBrowsing) {
      throw new CdpError(CDP_SERVER_ERROR, "Private windows are off limits.");
    }
    const url = target.currentURI?.spec ?? "";
    if (needsPage && !isPageUrl(url)) {
      throw new CdpError(CDP_SERVER_ERROR, `Only web pages can be read or used; this is ${url || "an empty page"}.`);
    }
    this.#bidi();
    return NavigableManager.getIdForBrowser(target);
  }

  async handle(target: CdpTarget, method: string, params: JsonObject): Promise<JsonObject> {
    if (NO_OPS.has(method)) {
      this.#context(target, false);
      return {};
    }
    try {
      switch (method) {
        case "Page.navigate":
          return await this.#navigate(target, params);
        case "Page.reload":
          return await this.#reload(target, params);
        case "Page.captureScreenshot":
          return await this.#screenshot(target, params);
        case "Page.bringToFront":
          await this.#execute("browsingContext", "activate", { context: this.#context(target, false) });
          return {};
        case "Runtime.evaluate":
          return await this.#evaluate(target, params);
        case "Input.dispatchMouseEvent":
          return await this.#perform(target, () => mouseEventSources(params));
        case "Input.dispatchKeyEvent":
          return await this.#perform(target, () => keyEventSources(params, lookupKey));
        case "Input.insertText":
          return await this.#perform(target, () => insertTextSources(params));
        default:
          throw new CdpError(CDP_METHOD_NOT_FOUND, `'${method}' wasn't found`);
      }
    } catch (error) {
      if (error instanceof CdpError) {
        throw error;
      }
      if (error instanceof InputError) {
        throw new CdpError(CDP_INVALID_PARAMS, error.message);
      }
      throw new CdpError(CDP_SERVER_ERROR, errorMessage(error));
    }
  }

  // Page.navigate {url} → {frameId, loaderId, errorText?}. Answers once the
  // new document is interactive; a load that fails is a result with
  // errorText, as in Chrome, not an error.
  async #navigate(target: CdpTarget, params: JsonObject): Promise<JsonObject> {
    const url = stringParam(params, "url");
    if (!isPageUrl(url)) {
      throw new CdpError(CDP_INVALID_PARAMS, "Only http, https and file pages can be opened.");
    }
    const context = this.#context(target, false);
    try {
      const result = await this.#bidi().execute("browsingContext", "navigate", { context, url, wait: "interactive" }) as {
        navigation: string | null;
      };
      return { frameId: context, loaderId: result.navigation ?? "" };
    } catch (error) {
      return { frameId: context, loaderId: "", errorText: errorMessage(error) };
    }
  }

  async #reload(target: CdpTarget, params: JsonObject): Promise<JsonObject> {
    const context = this.#context(target, false);
    await this.#execute("browsingContext", "reload", {
      context,
      ignoreCache: params.ignoreCache === true,
      wait: "none",
    });
    return {};
  }

  // Runtime.evaluate {expression, returnByValue, awaitPromise, userGesture}
  // → {result, exceptionDetails?}, run in the page's own realm.
  async #evaluate(target: CdpTarget, params: JsonObject): Promise<JsonObject> {
    const expression = stringParam(params, "expression");
    const byValue = params.returnByValue === true;
    const context = this.#context(target, true);
    const evaluated = await this.#execute("script", "evaluate", {
      expression,
      target: { context },
      awaitPromise: params.awaitPromise === true,
      resultOwnership: "none",
      serializationOptions: { maxObjectDepth: byValue ? null : 1, maxDomDepth: 0 },
      userActivation: params.userGesture === true,
    }) as
      | { type: "success"; result: BidiRemoteValue }
      | { type: "exception"; exceptionDetails: Parameters<typeof toExceptionDetails>[0] };
    if (evaluated.type === "success") {
      return { result: toRemoteObject(evaluated.result, byValue) as unknown as JsonObject };
    }
    this.#exceptionCounter += 1;
    const exceptionDetails = toExceptionDetails(evaluated.exceptionDetails, this.#exceptionCounter);
    return { result: exceptionDetails.exception, exceptionDetails };
  }

  async #perform(target: CdpTarget, sources: () => BidiInputSource[]): Promise<JsonObject> {
    const context = this.#context(target, true);
    await this.#execute("input", "performActions", { context, actions: sources() });
    return {};
  }

  // Page.captureScreenshot {format, quality, clip} → {data}, base64. The
  // visible viewport unless clipped; at the screen's pixel ratio, but never
  // wider than maxScreenshotWidth.
  async #screenshot(target: CdpTarget, params: JsonObject): Promise<JsonObject> {
    const format = typeof params.format === "string" ? params.format : "png";
    if (!SCREENSHOT_FORMATS.has(format)) {
      throw new CdpError(CDP_INVALID_PARAMS, `format: one of png, jpeg or webp expected`);
    }
    const quality = typeof params.quality === "number" ? params.quality : 80;
    this.#context(target, true);
    const global = target.browsingContext?.currentWindowGlobal;
    const document = target.ownerDocument;
    const view = document?.defaultView;
    if (!global || !document || !view) {
      throw new CdpError(CDP_SERVER_ERROR, "The page isn't showing.");
    }
    const zoom = (target as XULBrowserElement & { fullZoom?: number }).fullZoom ?? 1;
    let scale = view.devicePixelRatio * zoom;
    let rect: DOMRect | null = null;
    let width = target.clientWidth / zoom;
    const clip = params.clip;
    if (clip && typeof clip === "object" && !Array.isArray(clip)) {
      const { x, y, width: clipWidth, height: clipHeight } = clip;
      if (typeof x !== "number" || typeof y !== "number" || typeof clipWidth !== "number" || typeof clipHeight !== "number") {
        throw new CdpError(CDP_INVALID_PARAMS, "clip: x, y, width and height expected");
      }
      rect = new view.DOMRect(x, y, clipWidth, clipHeight);
      width = clipWidth;
      if (typeof clip.scale === "number" && clip.scale > 0) {
        scale *= clip.scale;
      }
    }
    if (width > 0) {
      scale = Math.min(scale, this.#maxScreenshotWidth / width);
    }
    const bitmap = await global.drawSnapshot(rect, scale, "rgb(255,255,255)");
    const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas") as HTMLCanvasElement;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    const url = canvas.toDataURL(`image/${format}`, quality / 100);
    if (!url.startsWith(`data:image/${format}`)) {
      throw new CdpError(CDP_SERVER_ERROR, `Kit can't encode image/${format}.`);
    }
    return { data: url.slice(url.indexOf(",") + 1) };
  }

  subscribe(target: CdpTarget, listener: CdpListener): () => void {
    let entry = this.#listeners.get(target);
    if (!entry) {
      const context = this.#context(target, false);
      const subscription = this.#execute("session", "subscribe", { events: BIDI_EVENTS, contexts: [context] })
        .then((result) => (result as { subscription?: string }).subscription ?? null)
        .catch((error: unknown) => {
          console.error("[NWCdp] Couldn't subscribe to the tab's events:", error);
          return null;
        });
      entry = { listeners: new Set(), subscription };
      this.#listeners.set(target, entry);
    }
    entry.listeners.add(listener);
    return () => this.#unsubscribe(target, listener);
  }

  #unsubscribe(target: CdpTarget, listener: CdpListener): void {
    const entry = this.#listeners.get(target);
    if (!entry || !entry.listeners.delete(listener) || entry.listeners.size > 0) {
      return;
    }
    this.#listeners.delete(target);
    void entry.subscription.then((id) => {
      if (id) {
        return bidi().execute("session", "unsubscribe", { subscriptions: [id] });
      }
    }).catch((error: unknown) => console.error("[NWCdp] Couldn't unsubscribe:", error));
  }

  // Arrow function: it's the message handler's listener.
  #onBidiEvent = (_name: string, event: { name: string; data: unknown }): void => {
    const contextId = eventContext(event.name, event.data);
    if (!contextId) {
      return;
    }
    const target = NavigableManager.getBrowsingContextById(contextId)?.top?.embedderElement as
      | CdpTarget
      | null
      | undefined;
    const entry = target ? this.#listeners.get(target) : undefined;
    if (!target || !entry) {
      return;
    }
    const topContext = NavigableManager.getIdForBrowser(target);
    for (const message of toCdpEvents(event.name, event.data, topContext)) {
      for (const listener of entry.listeners) {
        try {
          listener(message);
        } catch (error) {
          console.error("[NWCdp] A listener failed:", error);
        }
      }
    }
  };

  destroy(): void {
    for (const [target, entry] of this.#listeners) {
      for (const listener of [...entry.listeners]) {
        this.#unsubscribe(target, listener);
      }
    }
    if (this.#listening) {
      session?.messageHandler.off(PROTOCOL_EVENT, this.#onBidiEvent);
      this.#listening = false;
    }
  }
}

export function createCdpEngine(options: CdpEngineOptions = {}): CdpEngine {
  return new Engine(options);
}
