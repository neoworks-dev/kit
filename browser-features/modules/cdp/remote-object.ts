// SPDX-License-Identifier: MPL-2.0

// WebDriver BiDi RemoteValues as CDP RemoteObjects. The mapping of types to
// CDP's type/subtype/className follows Firefox's own CDP implementation
// (remote/cdp/domains/content/runtime/ExecutionContext.sys.mjs, removed in
// Firefox 129), which built them from Debugger.Objects instead.

import type { BidiRemoteValue, BidiStackTrace, Json, JsonObject, RemoteObject } from "./types.ts";

// BiDi type → CDP subtype and className, for object-like values.
const OBJECT_KINDS: Record<string, { subtype?: string; className: string }> = {
  object: { className: "Object" },
  array: { subtype: "array", className: "Array" },
  regexp: { subtype: "regexp", className: "RegExp" },
  date: { subtype: "date", className: "Date" },
  map: { subtype: "map", className: "Map" },
  set: { subtype: "set", className: "Set" },
  weakmap: { subtype: "weakmap", className: "WeakMap" },
  weakset: { subtype: "weakset", className: "WeakSet" },
  generator: { subtype: "generator", className: "Generator" },
  error: { subtype: "error", className: "Error" },
  proxy: { subtype: "proxy", className: "Object" },
  promise: { subtype: "promise", className: "Promise" },
  typedarray: { subtype: "typedarray", className: "TypedArray" },
  arraybuffer: { subtype: "arraybuffer", className: "ArrayBuffer" },
  nodelist: { subtype: "array", className: "NodeList" },
  htmlcollection: { subtype: "array", className: "HTMLCollection" },
  node: { subtype: "node", className: "Node" },
  window: { className: "Window" },
};

const SPECIAL_NUMBERS = new Set(["NaN", "-0", "Infinity", "-Infinity"]);

function isRemoteValue(value: unknown): value is BidiRemoteValue {
  return typeof value === "object" && value !== null && typeof (value as BidiRemoteValue).type === "string";
}

function entries(value: BidiRemoteValue): unknown[] {
  return Array.isArray(value.value) ? value.value : [];
}

// A BiDi value as plain JSON, the way returnByValue hands it over. Values
// JSON has no form for (undefined, functions, nodes) become null, and special
// numbers become null too, as JSON.stringify would make them.
export function remoteValueToJson(value: unknown): Json {
  if (!isRemoteValue(value)) {
    return null;
  }
  switch (value.type) {
    case "string":
    case "boolean":
      return value.value as Json;
    case "number":
      return typeof value.value === "number" ? value.value : null;
    case "bigint":
      return String(value.value);
    case "date":
      return String(value.value);
    case "regexp": {
      const regexp = value.value as { pattern?: string; flags?: string } | undefined;
      return `/${regexp?.pattern ?? ""}/${regexp?.flags ?? ""}`;
    }
    case "array":
    case "set":
    case "nodelist":
    case "htmlcollection":
      return entries(value).map(remoteValueToJson);
    case "object":
    case "map":
      return objectToJson(entries(value));
    default:
      return null;
  }
}

// BiDi object entries are [key, value] pairs whose key is a string or, for
// maps, a RemoteValue.
function objectToJson(pairs: unknown[]): JsonObject {
  const result: JsonObject = {};
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      continue;
    }
    const [key, item] = pair;
    const name = typeof key === "string" ? key : String(remoteValueToJson(key));
    result[name] = remoteValueToJson(item);
  }
  return result;
}

// A short human rendering of a value, as a console would print it, for
// RemoteObject.description.
export function describeRemoteValue(value: unknown, depth = 0): string {
  if (!isRemoteValue(value)) {
    return "";
  }
  switch (value.type) {
    case "undefined":
    case "null":
      return value.type;
    case "string":
      return depth === 0 ? String(value.value) : JSON.stringify(value.value);
    case "number":
    case "boolean":
      return String(value.value);
    case "bigint":
      return `${String(value.value)}n`;
    case "symbol":
      return "Symbol()";
    case "function":
      return "function";
    case "date":
      return String(value.value);
    case "regexp":
      return String(remoteValueToJson(value));
    case "node":
      return describeNode(value);
    case "array":
    case "set":
    case "nodelist":
    case "htmlcollection":
      return describeList(value, depth);
    case "object":
    case "map":
      return describeObject(value, depth);
    default:
      return OBJECT_KINDS[value.type]?.className ?? value.type;
  }
}

const DESCRIBED_ITEMS = 20;

function describeList(value: BidiRemoteValue, depth: number): string {
  const className = OBJECT_KINDS[value.type]?.className ?? "Array";
  if (!Array.isArray(value.value)) {
    return className;
  }
  const items = value.value;
  if (depth > 0) {
    return `${className}(${items.length})`;
  }
  const shown = items.slice(0, DESCRIBED_ITEMS).map((item) => describeRemoteValue(item, depth + 1));
  const more = items.length > DESCRIBED_ITEMS ? ", …" : "";
  const prefix = value.type === "array" ? "" : `${className}(${items.length}) `;
  return `${prefix}[${shown.join(", ")}${more}]`;
}

function describeObject(value: BidiRemoteValue, depth: number): string {
  const className = OBJECT_KINDS[value.type]?.className ?? "Object";
  if (!Array.isArray(value.value) || depth > 0) {
    return className;
  }
  const pairs = value.value.filter((pair): pair is [unknown, unknown] => Array.isArray(pair) && pair.length === 2);
  const shown = pairs.slice(0, DESCRIBED_ITEMS).map(([key, item]) => {
    const name = typeof key === "string" ? key : describeRemoteValue(key, depth + 1);
    return `${name}: ${describeRemoteValue(item, depth + 1)}`;
  });
  const more = pairs.length > DESCRIBED_ITEMS ? ", …" : "";
  const prefix = value.type === "map" ? `Map(${pairs.length}) ` : "";
  return `${prefix}{${shown.join(", ")}${more}}`;
}

function describeNode(value: BidiRemoteValue): string {
  const node = value.value as { localName?: string; nodeName?: string; attributes?: Record<string, string> } | undefined;
  let description = node?.localName ?? node?.nodeName ?? "node";
  const id = node?.attributes?.id;
  if (id) {
    description += `#${id}`;
  }
  const className = node?.attributes?.class;
  if (className) {
    description += "." + className.trim().split(/\s+/).join(".");
  }
  return description;
}

// A BiDi value as a CDP RemoteObject. With `byValue`, objects carry their
// JSON value too (Runtime.evaluate's returnByValue).
export function toRemoteObject(value: unknown, byValue: boolean): RemoteObject {
  if (!isRemoteValue(value)) {
    return { type: "undefined" };
  }
  switch (value.type) {
    case "undefined":
      return { type: "undefined" };
    case "null":
      return { type: "object", subtype: "null", value: null };
    case "string":
      return { type: "string", value: String(value.value) };
    case "boolean":
      return { type: "boolean", value: value.value === true };
    case "number":
      return numberObject(value.value);
    case "bigint":
      return { type: "bigint", unserializableValue: `${String(value.value)}n`, description: `${String(value.value)}n` };
    case "symbol":
      return { type: "symbol", description: "Symbol()" };
    case "function":
      return { type: "function", className: "Function", description: "function" };
  }
  const kind = OBJECT_KINDS[value.type] ?? { className: "Object" };
  const remote: RemoteObject = { type: "object", className: kind.className, description: describeRemoteValue(value) };
  if (kind.subtype) {
    remote.subtype = kind.subtype;
  }
  if (byValue) {
    remote.value = remoteValueToJson(value);
  }
  return remote;
}

function numberObject(value: unknown): RemoteObject {
  if (typeof value === "string" && SPECIAL_NUMBERS.has(value)) {
    return { type: "number", unserializableValue: value, description: value };
  }
  const number = Number(value);
  return { type: "number", value: number, description: String(number) };
}

// CDP call frames from a BiDi stack trace. Both count lines from 0.
export function toStackTrace(stackTrace: BidiStackTrace | undefined): JsonObject | undefined {
  if (!stackTrace || !Array.isArray(stackTrace.callFrames)) {
    return undefined;
  }
  return {
    callFrames: stackTrace.callFrames.map((frame) => ({
      functionName: frame.functionName ?? "",
      scriptId: "",
      url: frame.url ?? "",
      lineNumber: frame.lineNumber ?? 0,
      columnNumber: frame.columnNumber ?? 0,
    })),
  };
}

// "    at name (url:line:column)" lines, as V8 appends to an error's message.
export function stackText(stackTrace: BidiStackTrace | undefined): string {
  if (!stackTrace || !Array.isArray(stackTrace.callFrames)) {
    return "";
  }
  return stackTrace.callFrames
    .map((frame) => {
      const place = `${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`;
      return frame.functionName ? `    at ${frame.functionName} (${place})` : `    at ${place}`;
    })
    .join("\n");
}

interface BidiExceptionDetails {
  columnNumber: number;
  lineNumber: number;
  exception: BidiRemoteValue;
  stackTrace?: BidiStackTrace;
  text: string;
}

// script.evaluate's exceptionDetails as CDP's. CDP's `text` is "Uncaught";
// the error's message and stack are in exception.description, which is
// what clients print.
export function toExceptionDetails(details: BidiExceptionDetails, exceptionId: number): JsonObject {
  const exception = toRemoteObject(details.exception, false);
  const stack = stackText(details.stackTrace);
  exception.description = stack ? `${details.text}\n${stack}` : details.text;
  const firstFrame = details.stackTrace?.callFrames?.[0];
  const result: JsonObject = {
    exceptionId,
    text: "Uncaught",
    lineNumber: details.lineNumber ?? 0,
    columnNumber: details.columnNumber ?? 0,
    exception: exception as unknown as JsonObject,
  };
  if (firstFrame?.url) {
    result.url = firstFrame.url;
  }
  const stackTrace = toStackTrace(details.stackTrace);
  if (stackTrace) {
    result.stackTrace = stackTrace;
  }
  return result;
}
