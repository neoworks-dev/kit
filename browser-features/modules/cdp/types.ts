// SPDX-License-Identifier: MPL-2.0

// Shapes shared by Kit's CDP engine (NWCdp.sys.mts) and its pure helpers.
// The engine speaks the Chrome DevTools Protocol on one side and WebDriver
// BiDi (Gecko's in-process implementation) on the other; these are the bits
// of both it reads and writes. Loose on purpose: both protocols carry more
// than the engine looks at.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

// A CDP RemoteObject, as Runtime.evaluate and console events return them.
export interface RemoteObject {
  type: string;
  subtype?: string;
  className?: string;
  value?: Json;
  unserializableValue?: string;
  description?: string;
}

// A WebDriver BiDi RemoteValue (script.evaluate results, log arguments).
export interface BidiRemoteValue {
  type: string;
  value?: unknown;
  handle?: string;
  internalId?: string;
}

export interface BidiStackFrame {
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

export interface BidiStackTrace {
  callFrames: BidiStackFrame[];
}

// One input source of input.performActions.
export interface BidiInputSource {
  type: "key" | "pointer" | "wheel" | "none";
  id: string;
  parameters?: { pointerType: "mouse" | "pen" | "touch" };
  actions: JsonObject[];
}

// A CDP event from a target: what the engine's listeners receive.
export interface CdpEventMessage {
  method: string;
  params: JsonObject;
}

// Looks up the WebDriver code point for a key, by its CDP `code` (e.g.
// "NumpadEnter") or `key` (e.g. "Enter"). Null when there is none.
export type KeyLookup = (name: string) => string | null;
