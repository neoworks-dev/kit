// SPDX-License-Identifier: MPL-2.0

// Shared by the NWKeys actor (web content) and the chrome key listener, so a
// key sequence means the same thing wherever keyboard focus happens to be.

export const NW_KEYS_RUN_MESSAGE = "NWKeys:Run";
export const NW_KEYS_RUN_IN_PAGE_MESSAGE = "NWKeys:RunInPage";
export const NW_KEYS_OPEN_IN_BACKGROUND_MESSAGE = "NWKeys:OpenInBackground";
export const NW_KEYS_PENDING_MESSAGE = "NWKeys:Pending";

// Window events the chrome features listen for.
export const NW_COMMAND_EVENT = "NeoworksCommand";
export const NW_KEYS_PENDING_EVENT = "NeoworksKeysPending";

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
  "tab:move-up",
  "tab:move-down",
  "navigation:back",
  "navigation:forward",
  "spotlight:open",
  "page-actions:open",
  "sidebar:toggle-docked",
  "window:toggle-transparent",
  "workspace:next",
  "workspace:previous",
  "workspace:switch",
  "find:open",
  "downloads:open",
  "quickmark:set",
  "quickmark:jump",
  "split:vertical",
  "split:horizontal",
  "split:close",
  "ai:toggle",
] as const;

export type NWPageCommandId = (typeof NW_PAGE_COMMAND_IDS)[number];
export type NWChromeCommandId = (typeof NW_CHROME_COMMAND_IDS)[number];
export type NWCommandId = NWPageCommandId | NWChromeCommandId;

// Shown in the spotlight, the which-key popup and the settings key list.
export const NW_COMMAND_TITLES: Record<NWCommandId, string> = {
  "page:scroll-down": "Scroll Down",
  "page:scroll-up": "Scroll Up",
  "page:scroll-half-page-down": "Scroll Half a Page Down",
  "page:scroll-half-page-up": "Scroll Half a Page Up",
  "page:scroll-top": "Scroll to Top",
  "page:scroll-bottom": "Scroll to Bottom",
  "hints:open": "Follow Link",
  "hints:open-background": "Open Link in Background Tab",
  "tab:new": "New Tab",
  "tab:close": "Close Tab",
  "tab:next": "Next Tab",
  "tab:previous": "Previous Tab",
  "tab:reload": "Reload Tab",
  "tab:duplicate": "Duplicate Tab",
  "tab:toggle-pin": "Pin / Unpin Tab",
  "tab:reopen-closed": "Reopen Closed Tab",
  "tab:move-up": "Move Tab Up",
  "tab:move-down": "Move Tab Down",
  "navigation:back": "Back",
  "navigation:forward": "Forward",
  "spotlight:open": "Open Spotlight",
  "page-actions:open": "Page Actions",
  "sidebar:toggle-docked": "Toggle Sidebar Docking",
  "window:toggle-transparent": "Toggle Transparent Window",
  "workspace:next": "Next Workspace",
  "workspace:previous": "Previous Workspace",
  "workspace:switch": "Switch Workspace",
  "find:open": "Find in Page",
  "downloads:open": "Downloads",
  "quickmark:set": "Set Quickmark",
  "quickmark:jump": "Jump to Quickmark",
  "split:vertical": "Split Side by Side",
  "split:horizontal": "Split Stacked",
  "split:close": "Close Split Pane",
  "ai:toggle": "Toggle AI Sidebar",
};

export interface NWCommandInvocation {
  command: NWCommandId;
  // The key that picked the argument: a quickmark letter or a workspace number.
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
  | { kind: "pending" }
  | { kind: "match"; binding: NWKeyBinding };

const DEFAULT_SEQUENCE_TIMEOUT_MS = 2000;
const DOUBLE_SPACE_TIMEOUT_MS = 200;
const QUICKMARK_LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const WORKSPACE_NUMBERS = "123456789".split("");
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "OS"]);

// Outside text fields Space only exists for double Space: it never scrolls,
// not even when held.
const ALWAYS_CONSUMED_KEYS = new Set(["Space"]);

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

function workspaceNumberBindings(): NWKeyBinding[] {
  return WORKSPACE_NUMBERS.map((number) => ({
    keys: ["g", number],
    command: "workspace:switch",
    letter: number,
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
  { keys: ["<", "<"], command: "tab:move-up" },
  { keys: [">", ">"], command: "tab:move-down" },
  { keys: ["g", "w"], command: "workspace:next" },
  { keys: ["g", "W"], command: "workspace:previous" },
  ...workspaceNumberBindings(),
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
  // Space is the leader: Space w … are window (split) commands, as in vim's
  // C-w.
  { keys: ["Space", "w", "v"], command: "split:vertical" },
  { keys: ["Space", "w", "s"], command: "split:horizontal" },
  { keys: ["Space", "w", "q"], command: "split:close" },
  { keys: ["Space", "a"], command: "ai:toggle" },
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

export function isWorkspaceNumber(value: unknown): value is string {
  return typeof value === "string" && WORKSPACE_NUMBERS.includes(value);
}

// Any argument key a binding can carry.
export function isBindingLetter(value: unknown): value is string {
  return isQuickmarkLetter(value) || isWorkspaceNumber(value);
}

export function isValidKeySequence(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > 4) {
    return false;
  }
  return value.every((key) => typeof key === "string" && key.length <= 16);
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

export function isModifierKey(event: KeyboardEvent): boolean {
  return MODIFIER_KEYS.has(event.key);
}

// Normalized key name used in bindings, e.g. "j", "G", "Space", "C-d".
export function keyToken(event: KeyboardEvent): string {
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

export interface NWBindingSummary {
  command: NWCommandId;
  // Every key sequence for the command, e.g. ["J", "g t"] or ["m a–z"].
  keys: string[];
}

function argumentRange(
  bindings: readonly NWKeyBinding[],
  command: NWCommandId,
  prefix: string,
): string {
  const letters = bindings
    .filter((binding) =>
      binding.command === command && binding.letter &&
      describeKeys(binding.keys.slice(0, -1)) === prefix
    )
    .map((binding) => binding.letter);
  return `${prefix} ${letters[0]}–${letters[letters.length - 1]}`;
}

function bindingDescription(
  bindings: readonly NWKeyBinding[],
  binding: NWKeyBinding,
): string {
  if (!binding.letter) {
    return describeKeys(binding.keys);
  }
  return argumentRange(bindings, binding.command, describeKeys(binding.keys.slice(0, -1)));
}

// One entry per command in binding order, for a readable key reference.
// Argument families collapse: "m a" … "m z" become "m a–z".
export function summarizeBindings(
  bindings: readonly NWKeyBinding[] = NW_KEY_BINDINGS,
): NWBindingSummary[] {
  const summaries = new Map<NWCommandId, NWBindingSummary>();
  for (const binding of bindings) {
    let summary = summaries.get(binding.command);
    if (!summary) {
      summary = { command: binding.command, keys: [] };
      summaries.set(binding.command, summary);
    }
    const description = bindingDescription(bindings, binding);
    if (!summary.keys.includes(description)) {
      summary.keys.push(description);
    }
  }
  return Array.from(summaries.values());
}

export function bindingsForCommand(command: NWCommandId): NWKeyBinding[] {
  return NW_KEY_BINDINGS.filter((binding) => binding.command === command);
}

// Bindings that could still complete after `typedKeys`.
export function bindingsStartingWith(typedKeys: string[]): NWKeyBinding[] {
  return NW_KEY_BINDINGS.filter((binding) =>
    binding.keys.length > typedKeys.length && startsWithSequence(binding.keys, typedKeys)
  );
}

// Pure sequence state: which keys are typed so far and what they complete.
export class NWKeySequenceMatcher {
  private typed: string[] = [];

  constructor(private readonly bindings: readonly NWKeyBinding[] = NW_KEY_BINDINGS) {}

  get typedKeys(): string[] {
    return [...this.typed];
  }

  isPending(): boolean {
    return this.typed.length > 0;
  }

  reset(): void {
    this.typed = [];
  }

  continues(token: string): boolean {
    return this.candidates([...this.typed, token]).length > 0;
  }

  // The slowest candidate wins: a short double-Space timeout must not cut
  // off the Space leader sequences.
  pendingTimeoutMs(): number {
    const timeouts = this.candidates(this.typed).map(bindingTimeout);
    return Math.max(0, ...timeouts);
  }

  handle(token: string): NWKeyResult {
    if (this.typed.length > 0) {
      const continued = this.resolve([...this.typed, token]);
      if (continued.kind !== "none") {
        return continued;
      }
    }
    return this.resolve([token]);
  }

  private candidates(sequence: string[]): NWKeyBinding[] {
    return this.bindings.filter((binding) => startsWithSequence(binding.keys, sequence));
  }

  private resolve(sequence: string[]): NWKeyResult {
    const candidates = this.candidates(sequence);
    if (candidates.length === 0) {
      this.typed = [];
      return { kind: "none" };
    }
    const exactMatch = candidates.find((binding) => binding.keys.length === sequence.length);
    if (exactMatch) {
      this.typed = [];
      return { kind: "match", binding: exactMatch };
    }
    this.typed = sequence;
    return { kind: "pending" };
  }
}

export interface NWKeyDispatcherHost {
  runBinding(binding: NWKeyBinding): void;
  // Called with [] when no sequence is pending anymore.
  pendingChanged(typedKeys: string[]): void;
  // A pending prefix was dropped (timeout or a non-continuing key).
  prefixAbandoned(typedKeys: string[]): void;
  // Returns a function that cancels the timer.
  startTimer(callback: () => void, delayMs: number): () => void;
}

// Event-level driver around the matcher: consumption, key repeat, pending
// timeouts and notifications. Returns whether the key event must be swallowed.
export class NWKeyDispatcher {
  private readonly matcher = new NWKeySequenceMatcher();
  private cancelExpiry: (() => void) | null = null;

  constructor(private readonly host: NWKeyDispatcherHost) {}

  handleKey(token: string, repeat: boolean): boolean {
    this.stopExpiryTimer();
    if (repeat) {
      return this.handleRepeat(token);
    }
    this.abandonIfNotContinued(token);
    const wasPending = this.matcher.isPending();
    const result = this.matcher.handle(token);
    if (result.kind === "match") {
      if (wasPending) {
        this.host.pendingChanged([]);
      }
      this.host.runBinding(result.binding);
      return true;
    }
    if (result.kind === "pending") {
      this.host.pendingChanged(this.matcher.typedKeys);
      this.startExpiryTimer();
      return true;
    }
    return ALWAYS_CONSUMED_KEYS.has(token);
  }

  // Escape and focus changes drop a pending sequence without side effects.
  cancel(): void {
    this.stopExpiryTimer();
    if (!this.matcher.isPending()) {
      return;
    }
    this.matcher.reset();
    this.host.pendingChanged([]);
  }

  // Held keys repeat single-key motions but never start or finish a sequence.
  private handleRepeat(token: string): boolean {
    this.cancel();
    const result = this.matcher.handle(token);
    if (result.kind === "match") {
      this.host.runBinding(result.binding);
      return true;
    }
    this.matcher.reset();
    return ALWAYS_CONSUMED_KEYS.has(token);
  }

  private abandonIfNotContinued(token: string): void {
    if (!this.matcher.isPending() || this.matcher.continues(token)) {
      return;
    }
    const abandoned = this.matcher.typedKeys;
    this.matcher.reset();
    this.host.pendingChanged([]);
    this.host.prefixAbandoned(abandoned);
  }

  private startExpiryTimer(): void {
    this.cancelExpiry = this.host.startTimer(() => {
      this.cancelExpiry = null;
      const abandoned = this.matcher.typedKeys;
      this.matcher.reset();
      this.host.pendingChanged([]);
      this.host.prefixAbandoned(abandoned);
    }, this.matcher.pendingTimeoutMs());
  }

  private stopExpiryTimer(): void {
    if (this.cancelExpiry) {
      this.cancelExpiry();
      this.cancelExpiry = null;
    }
  }
}
