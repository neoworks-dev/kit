// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assertEquals,
  runTests,
  type TestCase,
} from "../../chrome/test/utils/test_harness.ts";
import { keyToken, NWKeySequenceMatcher } from "./NWKeymap.ts";

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

function commandOf(matcher: NWKeySequenceMatcher, token: string, now: number): string | null {
  const decision = matcher.handleKey(token, false, now);
  if (!decision.binding) {
    return null;
  }
  return decision.binding.command;
}

function testKeyTokens(): void {
  assertEquals(keyToken(keyEvent(" ")), "Space", "space is named");
  assertEquals(keyToken(keyEvent("J", { shiftKey: true })), "J", "shift is part of printable keys");
  assertEquals(keyToken(keyEvent("d", { ctrlKey: true })), "C-d", "ctrl prefix");
  assertEquals(keyToken(keyEvent("Tab", { shiftKey: true })), "S-Tab", "shift prefix on named keys");
  assertEquals(keyToken(keyEvent("Shift", { shiftKey: true })), null, "bare modifiers are ignored");
}

function testSingleKeyBinding(): void {
  const matcher = new NWKeySequenceMatcher();
  assertEquals(commandOf(matcher, "j", 0), "page:scroll-down", "j scrolls down");
}

function testSequenceWithinTimeout(): void {
  const matcher = new NWKeySequenceMatcher();
  const first = matcher.handleKey("g", false, 0);
  assertEquals(first.consume, true, "g prefix is swallowed");
  assertEquals(commandOf(matcher, "t", 100), "tab:next", "gt switches tab");
}

function testSequenceTimesOut(): void {
  const matcher = new NWKeySequenceMatcher();
  matcher.handleKey("g", false, 0);
  assertEquals(commandOf(matcher, "g", 5000), null, "late g starts a new sequence");
}

function testInvalidFollowUpRestarts(): void {
  const matcher = new NWKeySequenceMatcher();
  matcher.handleKey("g", false, 0);
  assertEquals(commandOf(matcher, "j", 100), "page:scroll-down", "g then j still scrolls");
}

function testSpacePrefixPassesThrough(): void {
  const matcher = new NWKeySequenceMatcher();
  const first = matcher.handleKey("Space", false, 0);
  assertEquals(first.consume, false, "first Space keeps its native scroll");
  assertEquals(commandOf(matcher, "Space", 200), "spotlight:open", "double Space opens spotlight");
}

function testDoubleSpaceUsesShortTimeout(): void {
  const matcher = new NWKeySequenceMatcher();
  matcher.handleKey("Space", false, 0);
  assertEquals(commandOf(matcher, "Space", 600), null, "slow Space presses stay scrolling");
}

function testRepeatNeverCompletesSequence(): void {
  const matcher = new NWKeySequenceMatcher();
  matcher.handleKey("Space", false, 0);
  const held = matcher.handleKey("Space", true, 30);
  assertEquals(held.binding, null, "holding Space does not open spotlight");
  const repeatedMotion = matcher.handleKey("j", true, 60);
  assertEquals(repeatedMotion.binding?.command, "page:scroll-down", "held j keeps scrolling");
}

function testQuickmarkLetters(): void {
  const matcher = new NWKeySequenceMatcher();
  matcher.handleKey("m", false, 0);
  const decision = matcher.handleKey("a", false, 100);
  assertEquals(decision.binding?.command, "quickmark:set", "ma sets a quickmark");
  assertEquals(decision.binding?.letter, "a", "letter is passed along");
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    { name: "keyToken normalizes keys and modifiers", fn: testKeyTokens },
    { name: "single-key binding matches", fn: testSingleKeyBinding },
    { name: "two-key sequence matches within timeout", fn: testSequenceWithinTimeout },
    { name: "sequence resets after timeout", fn: testSequenceTimesOut },
    { name: "invalid follow-up key starts a new sequence", fn: testInvalidFollowUpRestarts },
    { name: "Space prefix is not swallowed", fn: testSpacePrefixPassesThrough },
    { name: "double Space uses its short timeout", fn: testDoubleSpaceUsesShortTimeout },
    { name: "key repeat never completes a sequence", fn: testRepeatNeverCompletesSequence },
    { name: "quickmark bindings carry their letter", fn: testQuickmarkLetters },
  ];
  await runTests("NWKeymap.test.ts", tests);
}
