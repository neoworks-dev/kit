// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assert,
  assertEquals,
  runTests,
  type TestCase,
} from "../../chrome/test/utils/test_harness.ts";
import {
  isBindingLetter,
  isModifierKey,
  keyToken,
  type NWKeyBinding,
  NWKeyDispatcher,
  summarizeBindings,
} from "./NWKeymap.ts";

function keyEvent(key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    ...modifiers,
  } as KeyboardEvent;
}

// Dispatcher with a recording host and manually fired timers.
class DispatcherHarness {
  readonly ran: NWKeyBinding[] = [];
  readonly pending: string[][] = [];
  readonly abandoned: string[][] = [];
  timerDelayMs: number | null = null;
  private timerCallback: (() => void) | null = null;

  readonly dispatcher = new NWKeyDispatcher({
    runBinding: (binding) => this.ran.push(binding),
    pendingChanged: (keys) => this.pending.push(keys),
    prefixAbandoned: (keys) => this.abandoned.push(keys),
    startTimer: (callback, delayMs) => {
      this.timerCallback = callback;
      this.timerDelayMs = delayMs;
      return () => {
        this.timerCallback = null;
      };
    },
  });

  press(token: string, repeat = false): boolean {
    return this.dispatcher.handleKey(token, repeat);
  }

  fireTimer(): void {
    const callback = this.timerCallback;
    this.timerCallback = null;
    callback?.();
  }

  lastCommand(): string | null {
    const last = this.ran[this.ran.length - 1];
    if (!last) {
      return null;
    }
    return last.command;
  }
}

function testKeyTokens(): void {
  assertEquals(keyToken(keyEvent(" ")), "Space", "space is named");
  assertEquals(keyToken(keyEvent("J", { shiftKey: true })), "J", "shift is part of printable keys");
  assertEquals(keyToken(keyEvent("T", { shiftKey: true })), "T", "shifted letters keep their case");
  assertEquals(keyToken(keyEvent("d", { ctrlKey: true })), "C-d", "ctrl prefix");
  assertEquals(keyToken(keyEvent("Tab", { shiftKey: true })), "S-Tab", "shift prefix on named keys");
  assert(isModifierKey(keyEvent("Shift")), "bare Shift is a modifier key");
}

function testSingleKeyBinding(): void {
  const harness = new DispatcherHarness();
  assert(harness.press("j"), "j is consumed");
  assertEquals(harness.lastCommand(), "page:scroll-down", "j scrolls down");
}

function testSequence(): void {
  const harness = new DispatcherHarness();
  assert(harness.press("g"), "g prefix is swallowed");
  assertEquals(harness.pending[0].join(" "), "g", "pending g is announced");
  harness.press("T");
  assertEquals(harness.lastCommand(), "tab:previous", "gT switches to the previous tab");
  const lastPending = harness.pending[harness.pending.length - 1];
  assertEquals(lastPending.length, 0, "completing the sequence clears pending");
}

function testSequenceExpires(): void {
  const harness = new DispatcherHarness();
  harness.press("g");
  harness.fireTimer();
  assertEquals(harness.pending[harness.pending.length - 1].length, 0, "expiry clears pending");
  assertEquals(harness.abandoned[0].join(" "), "g", "expired prefix is reported");
  assertEquals(harness.ran.length, 0, "nothing runs on expiry");
}

function testInvalidFollowUpRestarts(): void {
  const harness = new DispatcherHarness();
  harness.press("g");
  harness.press("j");
  assertEquals(harness.abandoned[0].join(" "), "g", "g is abandoned");
  assertEquals(harness.lastCommand(), "page:scroll-down", "j still scrolls");
}

function testDoubleSpace(): void {
  const harness = new DispatcherHarness();
  assert(harness.press("Space"), "first Space is swallowed");
  assertEquals(harness.timerDelayMs, 200, "double Space waits 200ms");
  harness.press("Space");
  assertEquals(harness.lastCommand(), "spotlight:open", "double Space opens spotlight");
}

function testLoneSpaceIsAbandoned(): void {
  const harness = new DispatcherHarness();
  harness.press("Space");
  harness.fireTimer();
  assertEquals(harness.abandoned[0].join(" "), "Space", "lone Space is handed back");
  assertEquals(harness.ran.length, 0, "lone Space runs nothing");
}

function testHeldKeys(): void {
  const harness = new DispatcherHarness();
  harness.press("Space");
  assert(harness.press("Space", true), "held Space is still swallowed");
  assertEquals(harness.ran.length, 0, "held Space never opens spotlight");
  assert(harness.press("j", true), "held j is consumed");
  assertEquals(harness.lastCommand(), "page:scroll-down", "held j keeps scrolling");
  assert(!harness.press("g", true), "held prefix keys pass through");
}

function testQuickmarkLetters(): void {
  const harness = new DispatcherHarness();
  harness.press("'");
  harness.press("a");
  assertEquals(harness.lastCommand(), "quickmark:jump", "'a jumps to a quickmark");
  assertEquals(harness.ran[0].letter, "a", "letter is passed along");
}

function testWorkspaceSequences(): void {
  const harness = new DispatcherHarness();
  harness.press("g");
  harness.press("3");
  assertEquals(harness.lastCommand(), "workspace:switch", "g3 switches workspace");
  assertEquals(harness.ran[0].letter, "3", "workspace number is passed along");
  harness.press("g");
  harness.press("w");
  assertEquals(harness.lastCommand(), "workspace:next", "gw goes to the next workspace");
  harness.press("g");
  harness.press("W");
  assertEquals(harness.lastCommand(), "workspace:previous", "gW goes to the previous workspace");
}

function testBindingLetters(): void {
  assert(isBindingLetter("a"), "quickmark letters are binding letters");
  assert(isBindingLetter("9"), "workspace numbers are binding letters");
  assert(!isBindingLetter("0"), "workspaces are numbered from 1");
  assert(!isBindingLetter("ab"), "only single keys");
}

function testUnboundKeysPassThrough(): void {
  const harness = new DispatcherHarness();
  assert(!harness.press("q"), "unbound keys reach the page");
}

function summaryKeys(command: string): string {
  const summary = summarizeBindings().find((entry) => entry.command === command);
  if (!summary) {
    return "";
  }
  return summary.keys.join(", ");
}

function testBindingSummary(): void {
  assertEquals(summaryKeys("tab:next"), "J, g t", "all sequences of a command");
  assertEquals(summaryKeys("quickmark:set"), "m a–z", "quickmark letters collapse");
  assertEquals(summaryKeys("workspace:switch"), "g 1–9", "workspace numbers collapse");
  assertEquals(summaryKeys("spotlight:open"), "o, Space Space", "named keys");
  const commands = summarizeBindings().map((entry) => entry.command);
  assertEquals(new Set(commands).size, commands.length, "one entry per command");
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    { name: "keyToken normalizes keys and modifiers", fn: testKeyTokens },
    { name: "single-key binding runs", fn: testSingleKeyBinding },
    { name: "two-key sequence runs", fn: testSequence },
    { name: "pending sequence expires", fn: testSequenceExpires },
    { name: "invalid follow-up key starts a new sequence", fn: testInvalidFollowUpRestarts },
    { name: "double Space opens spotlight", fn: testDoubleSpace },
    { name: "lone Space is handed back", fn: testLoneSpaceIsAbandoned },
    { name: "held keys", fn: testHeldKeys },
    { name: "quickmark bindings carry their letter", fn: testQuickmarkLetters },
    { name: "workspace sequences under g", fn: testWorkspaceSequences },
    { name: "binding letters", fn: testBindingLetters },
    { name: "unbound keys pass through", fn: testUnboundKeysPassThrough },
    { name: "binding summary for the key reference", fn: testBindingSummary },
  ];
  await runTests("NWKeymap.test.ts", tests);
}
