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
const KEYLESS_ATTRIBUTE = "data-nw-keys-off";
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

// Modal surfaces (the first launch setup) handle their own keys.
function isInKeylessSurface(event: KeyboardEvent): boolean {
  return event.composedPath().some((target) =>
    target instanceof Element && target.hasAttribute(KEYLESS_ATTRIBUTE)
  );
}

function isSpaceActivatedTarget(event: KeyboardEvent): boolean {
  const target = event.target as Element | null;
  if (event.key !== " " || !target) {
    return false;
  }
  return SPACE_ACTIVATED_TAGS.has(target.localName);
}

// Remote <browser> elements forward keys to content, where the actor decides.
// In-process pages (about:preferences, about:downloads) dispatch their keys
// here too, with a target in the page's own document; the actor runs there
// as well and sees into the page's shadow DOM, which chrome can't.
function targetsWebContent(event: KeyboardEvent): boolean {
  const target = event.target as Node | null;
  if (!target) {
    return false;
  }
  if ((target as Element).localName === "browser") {
    return true;
  }
  return (target.ownerDocument ?? target) !== document;
}

function shouldCancel(event: KeyboardEvent): boolean {
  if (event.key === "Escape" || targetsWebContent(event)) {
    return true;
  }
  return isTypingTarget(event) || isInKeylessSurface(event) || isSpaceActivatedTarget(event);
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
