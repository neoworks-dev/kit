// SPDX-License-Identifier: MPL-2.0

// CDP's Input domain as WebDriver BiDi input.performActions. BiDi dispatches
// the events in the page's own process as trusted input (isTrusted), and keeps
// which buttons and keys are held per source id between calls, the way a
// CDP client expects a pressed button to stay pressed until its release.
//
// The tables follow Firefox's own CDP implementation (remote/cdp/domains/
// parent/Input.sys.mjs, removed in Firefox 129), which synthesized the
// events from the parent process instead.

import type { BidiInputSource, JsonObject, KeyLookup } from "./types.ts";

export class InputError extends Error {}

const MOUSE_ID = "cdp-mouse";
const WHEEL_ID = "cdp-wheel";
const KEYBOARD_ID = "cdp-keyboard";

const BUTTONS: Record<string, number> = {
  left: 0,
  middle: 1,
  right: 2,
  back: 3,
  forward: 4,
};

// CDP's modifier bits, and the key that holds each (WebDriver code points).
const MODIFIERS: [bit: number, key: string][] = [
  [1, "\uE00A"], // Alt
  [2, "\uE009"], // Control
  [4, "\uE03D"], // Meta
  [8, "\uE008"], // Shift
];

const PAUSE: JsonObject = { type: "pause", duration: 0 };

function modifierKeys(modifiers: unknown): string[] {
  if (typeof modifiers !== "number") {
    return [];
  }
  return MODIFIERS.filter(([bit]) => (modifiers & bit) !== 0).map(([, key]) => key);
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InputError(`${name}: number expected`);
  }
  return value;
}

// Runs `actions` on one source with the modifiers held around them: the
// modifiers go down first and come up after, one tick each, while the other
// source pauses.
function withModifiers(modifiers: string[], source: BidiInputSource): BidiInputSource[] {
  if (modifiers.length === 0) {
    return [source];
  }
  const down = modifiers.map((key) => ({ type: "keyDown", value: key }));
  const up = modifiers.toReversed().map((key) => ({ type: "keyUp", value: key }));
  const keys: BidiInputSource = {
    type: "key",
    id: KEYBOARD_ID,
    actions: [...down, ...source.actions.map(() => PAUSE), ...up],
  };
  const padded: BidiInputSource = {
    ...source,
    actions: [...down.map(() => PAUSE), ...source.actions, ...up.map(() => PAUSE)],
  };
  return [keys, padded];
}

// Input.dispatchMouseEvent {type, x, y, button, clickCount, deltaX, deltaY,
// modifiers}. BiDi counts clicks itself from timing and position, so a
// second press soon after the first is a double click either way.
export function mouseEventSources(params: JsonObject): BidiInputSource[] {
  const x = number(params.x, "x");
  const y = number(params.y, "y");
  const modifiers = modifierKeys(params.modifiers);
  const move = { type: "pointerMove", x, y, origin: "viewport", duration: 0 };
  const button = BUTTONS[String(params.button ?? "left")] ?? 0;

  switch (params.type) {
    case "mouseMoved":
      return withModifiers(modifiers, pointer([move]));
    case "mousePressed":
      return withModifiers(modifiers, pointer([move, { type: "pointerDown", button }]));
    case "mouseReleased":
      return withModifiers(modifiers, pointer([move, { type: "pointerUp", button }]));
    case "mouseWheel": {
      // BiDi takes whole pixels for wheel scrolls.
      const scroll = {
        type: "scroll",
        x: Math.round(x),
        y: Math.round(y),
        deltaX: Math.round(typeof params.deltaX === "number" ? params.deltaX : 0),
        deltaY: Math.round(typeof params.deltaY === "number" ? params.deltaY : 0),
        origin: "viewport",
        duration: 0,
      };
      return withModifiers(modifiers, { type: "wheel", id: WHEEL_ID, actions: [scroll] });
    }
    default:
      throw new InputError(`Unsupported mouse event type: ${String(params.type)}`);
  }
}

function pointer(actions: JsonObject[]): BidiInputSource {
  return { type: "pointer", id: MOUSE_ID, parameters: { pointerType: "mouse" }, actions };
}

// Splits text into what a person would type key by key: user-perceived
// characters, so an emoji or a letter with a combining accent is one press.
export function graphemes(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (segment) => segment.segment);
}

// The WebDriver key value for a CDP key event: the named key (by `code`, then
// `key`) for keys that aren't text, else the single character typed.
export function keyValue(params: JsonObject, lookup: KeyLookup): string {
  const key = typeof params.key === "string" ? params.key : "";
  const code = typeof params.code === "string" ? params.code : "";
  const text = typeof params.text === "string" ? params.text : "";
  if (key && graphemes(key).length === 1) {
    return key;
  }
  const named = (code && lookup(code)) || (key && lookup(key));
  if (named) {
    return named;
  }
  if (text && graphemes(text).length === 1) {
    return text === "\r" ? "\uE006" : text;
  }
  throw new InputError(`Unknown key: ${key || code || JSON.stringify(text)}`);
}

// What typing `text` sends: each character as a press and a release. A line
// break is the Enter key, as on a keyboard.
export function typingActions(text: string): JsonObject[] {
  const actions: JsonObject[] = [];
  for (const character of graphemes(text)) {
    let value = character;
    if (character === "\n" || character === "\r" || character === "\r\n") {
      value = "\uE006";
    }
    actions.push({ type: "keyDown", value }, { type: "keyUp", value });
  }
  return actions;
}

// Input.dispatchKeyEvent {type, key, code, text, modifiers}. keyDown and
// rawKeyDown both press the key (Firefox's CDP did the same), keyUp releases
// it, and char types its text.
export function keyEventSources(params: JsonObject, lookup: KeyLookup): BidiInputSource[] {
  const modifiers = modifierKeys(params.modifiers);
  switch (params.type) {
    case "keyDown":
    case "rawKeyDown": {
      const value = keyValue(params, lookup);
      const down = modifiers.map((key) => ({ type: "keyDown", value: key }));
      return [keyboard([...down, { type: "keyDown", value }])];
    }
    case "keyUp": {
      const value = keyValue(params, lookup);
      const up = modifiers.toReversed().map((key) => ({ type: "keyUp", value: key }));
      return [keyboard([{ type: "keyUp", value }, ...up])];
    }
    case "char": {
      const text = typeof params.text === "string" ? params.text : String(params.key ?? "");
      return withModifiers(modifiers, keyboard(typingActions(text)));
    }
    default:
      throw new InputError(`Unsupported key event type: ${String(params.type)}`);
  }
}

// Input.insertText {text}: typed character by character as trusted key
// presses, since BiDi has no IME-style text insertion.
export function insertTextSources(params: JsonObject): BidiInputSource[] {
  if (typeof params.text !== "string") {
    throw new InputError("text: string expected");
  }
  return [keyboard(typingActions(params.text))];
}

function keyboard(actions: JsonObject[]): BidiInputSource {
  return { type: "key", id: KEYBOARD_ID, actions };
}
