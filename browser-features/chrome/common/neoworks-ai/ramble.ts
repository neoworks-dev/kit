// SPDX-License-Identifier: MPL-2.0

// A ramble from the desktop overlay as the panel's card shows it: runs of
// what the user said, with what they did meanwhile as small chips where it
// happened. The agent reads the same order as text, written by the overlay.

import type { RambleCapture, RambleEvent, RambleSegment, RambleThing } from "./types.ts";

const MAX_SELECTION_CHARS = 60;

// Said words and events, in the order they happened; words in a row make one run.
// Where the mouse rested is left out: on a card it is noise.
export function rambleSegments(capture: RambleCapture): RambleSegment[] {
  const segments: RambleSegment[] = [];
  const events = capture.events.filter((event) => event.kind !== "cursor");
  let run: string[] = [];
  const flush = () => {
    if (run.length > 0) {
      segments.push({ kind: "words", text: run.join(" ") });
      run = [];
    }
  };
  let next = 0;
  for (const word of capture.words) {
    while (next < events.length && events[next].at <= word.at) {
      flush();
      segments.push(eventSegment(capture, events[next]));
      next++;
    }
    run.push(word.text);
  }
  flush();
  for (; next < events.length; next++) {
    segments.push(eventSegment(capture, events[next]));
  }
  return segments;
}

function eventSegment(capture: RambleCapture, event: RambleEvent): RambleSegment {
  let screenshot: string | null = null;
  if (event.kind === "screenshot") {
    const shot = capture.screenshots[event.index];
    if (shot) {
      screenshot = PathUtils.toFileURI(shot.path);
    }
  }
  return { kind: "event", label: eventLabel(event), icon: eventIcon(event), screenshot };
}

function eventLabel(event: RambleEvent): string {
  switch (event.kind) {
    case "cursor":
      return thingLabel(event.on);
    case "click":
      return `clicked ${thingLabel(event.on)}`;
    case "circle":
      return `circled ${thingLabel(event.on)}`;
    case "line":
      return `${thingLabel(event.fromThing)} → ${thingLabel(event.toThing)}`;
    case "scribble":
      return `scribbled on ${thingLabel(event.on)}`;
    case "selection":
      return `“${clip(event.text, MAX_SELECTION_CHARS)}”`;
    case "workspace":
      return `workspace ${event.workspace}`;
    case "focus":
      return event.window.class;
    case "drag":
      return `moved ${event.widget}`;
    case "screenshot":
      return `screenshot ${event.index + 1}`;
  }
}

// An .nw-icon data-icon name for the chip.
function eventIcon(event: RambleEvent): string {
  switch (event.kind) {
    case "click":
      return "cursor-click";
    case "circle":
    case "scribble":
    case "line":
      return "pencil-simple";
    case "selection":
      return "text-aa";
    case "screenshot":
      return "camera";
    default:
      return "app-window";
  }
}

function thingLabel(thing: RambleThing): string {
  if (thing.kind === "widget") {
    return thing.id;
  }
  if (thing.kind === "window") {
    return thing.class;
  }
  return "desktop";
}

// `23s`, `1m 5s`.
export function rambleDuration(capture: RambleCapture): string {
  const seconds = Math.max(0, Math.round((capture.endedAt - capture.startedAt) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// The ramble capture a companion message carries, if it is one.
export function rambleOf(display: unknown): RambleCapture | null {
  if (typeof display !== "object" || display === null) {
    return null;
  }
  const fields = display as { kind?: unknown; capture?: unknown };
  if (fields.kind !== "ramble" || typeof fields.capture !== "object" || fields.capture === null) {
    return null;
  }
  const capture = fields.capture as Partial<RambleCapture>;
  if (capture.version !== 1 || !Array.isArray(capture.words) || !Array.isArray(capture.events)) {
    return null;
  }
  return capture as RambleCapture;
}

function clip(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) {
    return oneLine;
  }
  return `${oneLine.slice(0, max - 1)}…`;
}
