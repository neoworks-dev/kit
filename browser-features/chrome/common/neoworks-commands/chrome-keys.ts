// SPDX-License-Identifier: MPL-2.0

// Chrome-side twin of the NWKeys actor: runs the same key bindings while focus
// is in the browser UI (sidebar, menus). Keys aimed at web content are left to
// the actor.

import {
  keyToken,
  type NWCommandInvocation,
  NWKeySequenceMatcher,
} from "#features-modules/common/NWKeymap.ts";

const EDITABLE_TAGS = new Set(["input", "textarea", "select"]);

function isEditableElement(element: Element): boolean {
  if (EDITABLE_TAGS.has(element.localName)) {
    return true;
  }
  return (element as HTMLElement).isContentEditable === true;
}

function isTypingTarget(event: KeyboardEvent): boolean {
  for (const target of event.composedPath()) {
    if (target instanceof Element && isEditableElement(target)) {
      return true;
    }
  }
  return false;
}

// Remote <browser> elements forward keys to content, where the actor decides.
function targetsWebContent(event: KeyboardEvent): boolean {
  const target = event.target as Element | null;
  return target?.localName === "browser";
}

function shouldIgnore(event: KeyboardEvent): boolean {
  if (event.key === "Escape") {
    return true;
  }
  return isTypingTarget(event) || targetsWebContent(event);
}

export function listenForChromeKeys(
  onCommand: (invocation: NWCommandInvocation) => void,
): () => void {
  const matcher = new NWKeySequenceMatcher();

  function handleKeyDown(event: KeyboardEvent): void {
    const token = keyToken(event);
    if (!token || shouldIgnore(event)) {
      matcher.reset();
      return;
    }
    const decision = matcher.handleKey(token, event.repeat, Date.now());
    if (!decision.consume) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (decision.binding) {
      onCommand({ command: decision.binding.command, letter: decision.binding.letter });
    }
  }

  addEventListener("keydown", handleKeyDown, true);
  return () => removeEventListener("keydown", handleKeyDown, true);
}
