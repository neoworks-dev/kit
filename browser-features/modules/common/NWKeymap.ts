// SPDX-License-Identifier: MPL-2.0

// Shared by the NWKeys actor (web content) and the chrome key listener, so a
// key sequence means the same thing wherever keyboard focus happens to be.

export const NW_KEYS_RUN_MESSAGE = "NWKeys:Run";
export const NW_KEYS_RUN_IN_PAGE_MESSAGE = "NWKeys:RunInPage";
export const NW_KEYS_OPEN_IN_BACKGROUND_MESSAGE = "NWKeys:OpenInBackground";

// Window event the chrome command feature listens for.
export const NW_COMMAND_EVENT = "NeoworksCommand";

// Commands that act on the page itself; they run inside the content process.
export const NW_PAGE_COMMAND_IDS = [
  "page:scroll-down",
  "page:scroll-up",
  "page:scroll-half-page-down",
  "page:scroll-half-page-up",
  "page:scroll-top",
  "page:scroll-bottom",
  "hints:open",
  "hints:open-background",
] as const;

export const NW_CHROME_COMMAND_IDS = [
  "tab:new",
  "tab:close",
  "tab:next",
  "tab:previous",
  "tab:reload",
  "tab:duplicate",
  "tab:toggle-pin",
  "tab:reopen-closed",
  "navigation:back",
  "navigation:forward",
  "spotlight:open",
  "find:open",
  "quickmark:set",
  "quickmark:jump",
] as const;

export type NWPageCommandId = (typeof NW_PAGE_COMMAND_IDS)[number];
export type NWChromeCommandId = (typeof NW_CHROME_COMMAND_IDS)[number];
export type NWCommandId = NWPageCommandId | NWChromeCommandId;

export interface NWCommandInvocation {
  command: NWCommandId;
  letter?: string;
}

export interface NWKeyBinding {
  keys: string[];
  command: NWCommandId;
  letter?: string;
  timeoutMs?: number;
}

export type NWKeyResult =
  | { kind: "none" }
  | { kind: "pending"; consume: boolean }
  | { kind: "match"; binding: NWKeyBinding };

export interface NWKeyDecision {
  consume: boolean;
  binding: NWKeyBinding | null;
}

const DEFAULT_SEQUENCE_TIMEOUT_MS = 800;
const DOUBLE_SPACE_TIMEOUT_MS = 400;
const QUICKMARK_LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "OS"]);

function quickmarkBindings(
  prefix: string,
  command: NWChromeCommandId,
): NWKeyBinding[] {
  return QUICKMARK_LETTERS.map((letter) => ({
    keys: [prefix, letter],
    command,
    letter,
  }));
}

export const NW_KEY_BINDINGS: readonly NWKeyBinding[] = [
  { keys: ["j"], command: "page:scroll-down" },
  { keys: ["k"], command: "page:scroll-up" },
  { keys: ["d"], command: "page:scroll-half-page-down" },
  { keys: ["u"], command: "page:scroll-half-page-up" },
  { keys: ["g", "g"], command: "page:scroll-top" },
  { keys: ["G"], command: "page:scroll-bottom" },
  { keys: ["f"], command: "hints:open" },
  { keys: ["F"], command: "hints:open-background" },
  { keys: ["J"], command: "tab:next" },
  { keys: ["K"], command: "tab:previous" },
  { keys: ["g", "t"], command: "tab:next" },
  { keys: ["g", "T"], command: "tab:previous" },
  { keys: ["t"], command: "tab:new" },
  { keys: ["x"], command: "tab:close" },
  { keys: ["H"], command: "navigation:back" },
  { keys: ["L"], command: "navigation:forward" },
  { keys: ["o"], command: "spotlight:open" },
  {
    keys: ["Space", "Space"],
    command: "spotlight:open",
    timeoutMs: DOUBLE_SPACE_TIMEOUT_MS,
  },
  { keys: ["/"], command: "find:open" },
  ...quickmarkBindings("m", "quickmark:set"),
  ...quickmarkBindings("'", "quickmark:jump"),
];

const PAGE_COMMANDS = new Set<string>(NW_PAGE_COMMAND_IDS);
const CHROME_COMMANDS = new Set<string>(NW_CHROME_COMMAND_IDS);

export function isPageCommand(command: string): command is NWPageCommandId {
  return PAGE_COMMANDS.has(command);
}

export function isChromeCommand(command: string): command is NWChromeCommandId {
  return CHROME_COMMANDS.has(command);
}

export function isQuickmarkLetter(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]$/.test(value);
}

function modifierPrefix(event: KeyboardEvent, namedKey: boolean): string {
  let prefix = "";
  if (event.ctrlKey) {
    prefix += "C-";
  }
  if (event.altKey) {
    prefix += "A-";
  }
  if (event.metaKey) {
    prefix += "M-";
  }
  // Shift is already part of printable keys ("J" vs "j").
  if (event.shiftKey && namedKey) {
    prefix += "S-";
  }
  return prefix;
}

// Normalized key name used in bindings, e.g. "j", "G", "Space", "C-d".
// Returns null for keys that can never start or continue a binding.
export function keyToken(event: KeyboardEvent): string | null {
  if (event.isComposing || MODIFIER_KEYS.has(event.key)) {
    return null;
  }
  let key = event.key;
  if (key === " ") {
    key = "Space";
  }
  const namedKey = key.length > 1;
  return modifierPrefix(event, namedKey) + key;
}

function startsWithSequence(keys: string[], sequence: string[]): boolean {
  if (keys.length < sequence.length) {
    return false;
  }
  return sequence.every((key, index) => keys[index] === key);
}

function bindingTimeout(binding: NWKeyBinding): number {
  if (binding.timeoutMs) {
    return binding.timeoutMs;
  }
  return DEFAULT_SEQUENCE_TIMEOUT_MS;
}

export function describeKeys(keys: string[]): string {
  return keys.join(" ");
}

export function bindingsForCommand(command: NWCommandId): NWKeyBinding[] {
  return NW_KEY_BINDINGS.filter((binding) => binding.command === command);
}

export class NWKeySequenceMatcher {
  private typedKeys: string[] = [];
  private lastKeyTime = 0;

  constructor(private readonly bindings: readonly NWKeyBinding[] = NW_KEY_BINDINGS) {}

  reset(): void {
    this.typedKeys = [];
  }

  // Event-level wrapper around `handle`: whether to swallow the key and which
  // binding (if any) completed.
  handleKey(token: string, repeat: boolean, now: number): NWKeyDecision {
    // Held keys may repeat single-key motions but never complete a sequence.
    if (repeat) {
      this.reset();
    }
    const result = this.handle(token, now);
    if (result.kind === "match") {
      return { consume: true, binding: result.binding };
    }
    if (result.kind === "pending") {
      return { consume: result.consume, binding: null };
    }
    return { consume: false, binding: null };
  }

  handle(token: string, now: number): NWKeyResult {
    const elapsedMs = now - this.lastKeyTime;
    this.lastKeyTime = now;
    if (this.typedKeys.length > 0) {
      const continued = this.resolve([...this.typedKeys, token], elapsedMs);
      if (continued.kind !== "none") {
        return continued;
      }
    }
    return this.resolve([token], 0);
  }

  private resolve(sequence: string[], elapsedMs: number): NWKeyResult {
    const candidates = this.bindings.filter((binding) =>
      startsWithSequence(binding.keys, sequence) &&
      elapsedMs <= bindingTimeout(binding)
    );
    if (candidates.length === 0) {
      this.typedKeys = [];
      return { kind: "none" };
    }
    const exactMatch = candidates.find((binding) => binding.keys.length === sequence.length);
    if (exactMatch) {
      this.typedKeys = [];
      return { kind: "match", binding: exactMatch };
    }
    this.typedKeys = sequence;
    // A lone Space keeps its native meaning (scroll, activate) so double
    // Space doesn't delay single-Space scrolling.
    const lastKey = sequence[sequence.length - 1];
    return { kind: "pending", consume: lastKey !== "Space" };
  }
}
