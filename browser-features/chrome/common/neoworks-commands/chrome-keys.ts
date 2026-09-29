// SPDX-License-Identifier: MPL-2.0

// Chrome-side twin of the NWKeys actor: runs the same key bindings while focus
// is in the browser UI (sidebar, menus). Keys aimed at web content are left to
// the actor.

import {
  isModifierKey,
  keyToken,
  NW_KEYS_PENDING_EVENT,
  type NWCommandInvocation,
  NWKeyDispatcher,
} from "#features-modules/common/NWKeymap.ts";

const EDITABLE_TAGS = new Set(["input", "textarea", "select"]);
const SPACE_ACTIVATED_TAGS = new Set(["button", "toolbarbutton", "checkbox", "menuitem"]);

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

function isSpaceActivatedTarget(event: KeyboardEvent): boolean {
  const target = event.target as Element | null;
  if (event.key !== " " || !target) {
    return false;
  }
  return SPACE_ACTIVATED_TAGS.has(target.localName);
}

// Remote <browser> elements forward keys to content, where the actor decides.
function targetsWebContent(event: KeyboardEvent): boolean {
  const target = event.target as Element | null;
  return target?.localName === "browser";
}

function shouldCancel(event: KeyboardEvent): boolean {
  if (event.key === "Escape" || targetsWebContent(event)) {
    return true;
  }
  return isTypingTarget(event) || isSpaceActivatedTarget(event);
}

function announcePending(keys: string[]): void {
  dispatchEvent(new CustomEvent(NW_KEYS_PENDING_EVENT, { detail: { keys } }));
}

export function listenForChromeKeys(
  onCommand: (invocation: NWCommandInvocation) => void,
): () => void {
  const dispatcher = new NWKeyDispatcher({
    runBinding: (binding) => onCommand({ command: binding.command, letter: binding.letter }),
    pendingChanged: announcePending,
    prefixAbandoned: () => {},
    startTimer: (callback, delayMs) => {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    },
  });

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.isComposing || isModifierKey(event)) {
      return;
    }
    if (shouldCancel(event)) {
      dispatcher.cancel();
      return;
    }
    if (dispatcher.handleKey(keyToken(event), event.repeat)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  addEventListener("keydown", handleKeyDown, true);
  return () => {
    removeEventListener("keydown", handleKeyDown, true);
    dispatcher.cancel();
  };
}
