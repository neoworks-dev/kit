// SPDX-License-Identifier: MPL-2.0

// WebDriver BiDi events as the CDP events a client listens for: console and
// uncaught errors (Runtime), requests and their outcome (Network), and where
// the page went (Page).

import { describeRemoteValue, stackText, toRemoteObject, toStackTrace } from "./remote-object.ts";
import type { BidiRemoteValue, BidiStackTrace, CdpEventMessage, JsonObject } from "./types.ts";

// The BiDi events the engine subscribes to for a target.
export const BIDI_EVENTS = [
  "log.entryAdded",
  "network.beforeRequestSent",
  "network.responseCompleted",
  "network.fetchError",
  "browsingContext.navigationCommitted",
  "browsingContext.fragmentNavigated",
  "browsingContext.historyUpdated",
];

// console.* method → Runtime.consoleAPICalled type.
const CONSOLE_TYPES: Record<string, string> = {
  warn: "warning",
  group: "startGroup",
  groupCollapsed: "startGroupCollapsed",
  groupEnd: "endGroup",
  timeLog: "timeEnd",
  time: "timeEnd",
};

interface BidiLogEntry {
  type: string;
  method?: string;
  level?: string;
  text?: string;
  args?: BidiRemoteValue[];
  stackTrace?: BidiStackTrace;
  timestamp?: number;
}

interface BidiRequest {
  request: string;
  url: string;
  method: string;
  headers?: { name: string; value: { type: string; value: string } }[];
  destination?: string;
  initiatorType?: string | null;
}

interface BidiNetworkEvent {
  context: string | null;
  navigation: string | null;
  request: BidiRequest;
  timestamp: number;
  response?: {
    url: string;
    status: number;
    statusText: string;
    mimeType: string;
    headers?: { name: string; value: { type: string; value: string } }[];
    fromCache?: boolean;
  };
  errorText?: string;
}

interface BidiNavigationEvent {
  context: string;
  navigation?: string | null;
  url: string;
  timestamp?: number;
}

// CDP timestamps are seconds; BiDi's are milliseconds since the epoch.
function seconds(milliseconds: number | undefined): number {
  return (milliseconds ?? Date.now()) / 1000;
}

function headerObject(headers: BidiNetworkEvent["request"]["headers"]): JsonObject {
  const result: JsonObject = {};
  for (const header of headers ?? []) {
    result[header.name] = header.value?.value ?? "";
  }
  return result;
}

// Fetch destination / initiator → CDP resource type.
function resourceType(event: BidiNetworkEvent): string {
  if (event.navigation) {
    return "Document";
  }
  const destination = event.request.destination ?? "";
  const initiator = event.request.initiatorType ?? "";
  if (initiator === "xmlhttprequest") {
    return "XHR";
  }
  if (initiator === "fetch" || initiator === "beacon") {
    return "Fetch";
  }
  switch (destination) {
    case "document":
    case "iframe":
    case "frame":
      return "Document";
    case "script":
    case "worker":
    case "sharedworker":
    case "serviceworker":
      return "Script";
    case "style":
      return "Stylesheet";
    case "image":
      return "Image";
    case "font":
      return "Font";
    case "audio":
    case "video":
    case "track":
      return "Media";
    case "manifest":
      return "Manifest";
    default:
      return "Other";
  }
}

function consoleEvent(entry: BidiLogEntry): CdpEventMessage {
  const method = entry.method ?? "log";
  const params: JsonObject = {
    type: CONSOLE_TYPES[method] ?? method,
    args: (entry.args ?? []).map((arg) => {
      const remote = toRemoteObject(arg, false);
      if (remote.type === "object" && !remote.description) {
        remote.description = describeRemoteValue(arg);
      }
      return remote as unknown as JsonObject;
    }),
    executionContextId: 1,
    timestamp: entry.timestamp ?? Date.now(),
  };
  const stackTrace = toStackTrace(entry.stackTrace);
  if (stackTrace) {
    params.stackTrace = stackTrace;
  }
  return { method: "Runtime.consoleAPICalled", params };
}

let exceptionCounter = 0;

function exceptionEvent(entry: BidiLogEntry): CdpEventMessage {
  exceptionCounter += 1;
  const text = entry.text ?? "Uncaught exception";
  const stack = stackText(entry.stackTrace);
  const firstFrame = entry.stackTrace?.callFrames?.[0];
  const exceptionDetails: JsonObject = {
    exceptionId: exceptionCounter,
    text: "Uncaught",
    lineNumber: firstFrame?.lineNumber ?? 0,
    columnNumber: firstFrame?.columnNumber ?? 0,
    exception: {
      type: "object",
      subtype: "error",
      className: "Error",
      description: stack ? `${text}\n${stack}` : text,
    },
  };
  if (firstFrame?.url) {
    exceptionDetails.url = firstFrame.url;
  }
  const stackTrace = toStackTrace(entry.stackTrace);
  if (stackTrace) {
    exceptionDetails.stackTrace = stackTrace;
  }
  return {
    method: "Runtime.exceptionThrown",
    params: { timestamp: entry.timestamp ?? Date.now(), exceptionDetails },
  };
}

function requestEvent(event: BidiNetworkEvent): CdpEventMessage {
  return {
    method: "Network.requestWillBeSent",
    params: {
      requestId: event.request.request,
      loaderId: event.navigation ?? "",
      documentURL: event.request.url,
      request: {
        url: event.request.url,
        method: event.request.method,
        headers: headerObject(event.request.headers),
      },
      timestamp: seconds(event.timestamp),
      wallTime: seconds(event.timestamp),
      initiator: { type: "other" },
      type: resourceType(event),
      frameId: event.context ?? "",
    },
  };
}

function responseEvent(event: BidiNetworkEvent): CdpEventMessage | null {
  const response = event.response;
  if (!response) {
    return null;
  }
  return {
    method: "Network.responseReceived",
    params: {
      requestId: event.request.request,
      loaderId: event.navigation ?? "",
      timestamp: seconds(event.timestamp),
      type: resourceType(event),
      response: {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        headers: headerObject(response.headers),
        mimeType: response.mimeType,
        fromDiskCache: response.fromCache === true,
      },
      frameId: event.context ?? "",
    },
  };
}

// CDP's loadingFailed has no URL; Kit adds `url` (not in CDP) so a client
// that missed the request still knows which one failed.
function failureEvent(event: BidiNetworkEvent): CdpEventMessage {
  const errorText = event.errorText ?? "net::ERR_FAILED";
  return {
    method: "Network.loadingFailed",
    params: {
      requestId: event.request.request,
      timestamp: seconds(event.timestamp),
      type: resourceType(event),
      errorText,
      canceled: errorText.includes("NS_BINDING_ABORTED"),
      url: event.request.url,
    },
  };
}

// `topContext` is the target's own context id, which CDP calls the main
// frame's id; events from frames in it carry their own context.
function frameNavigatedEvent(event: BidiNavigationEvent, topContext: string): CdpEventMessage {
  const frame: JsonObject = {
    id: event.context,
    loaderId: event.navigation ?? "",
    url: event.url,
    securityOrigin: originOf(event.url),
    mimeType: "text/html",
  };
  if (event.context !== topContext) {
    frame.parentId = topContext;
  }
  return { method: "Page.frameNavigated", params: { frame, type: "Navigation" } };
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

// The CDP events for one BiDi event; empty when it has none.
export function toCdpEvents(name: string, data: unknown, topContext: string): CdpEventMessage[] {
  switch (name) {
    case "log.entryAdded": {
      const entry = data as BidiLogEntry;
      if (entry.type === "console") {
        return [consoleEvent(entry)];
      }
      if (entry.type === "javascript") {
        return [exceptionEvent(entry)];
      }
      return [];
    }
    case "network.beforeRequestSent":
      return [requestEvent(data as BidiNetworkEvent)];
    case "network.responseCompleted": {
      const event = responseEvent(data as BidiNetworkEvent);
      return event ? [event] : [];
    }
    case "network.fetchError":
      return [failureEvent(data as BidiNetworkEvent)];
    case "browsingContext.navigationCommitted":
      return [frameNavigatedEvent(data as BidiNavigationEvent, topContext)];
    case "browsingContext.fragmentNavigated":
    case "browsingContext.historyUpdated": {
      const event = data as BidiNavigationEvent;
      return [{ method: "Page.navigatedWithinDocument", params: { frameId: event.context, url: event.url } }];
    }
    default:
      return [];
  }
}

// The context an event is about, to find its target by.
export function eventContext(name: string, data: unknown): string | null {
  const event = data as { context?: string | null; source?: { context?: string } };
  if (name === "log.entryAdded") {
    return event.source?.context ?? null;
  }
  return event.context ?? null;
}
