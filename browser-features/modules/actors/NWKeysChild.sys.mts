/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { findScrollableElement, isEditableEvent } from "./NWPageUtils.ts";
import { NWLinkHintSession } from "./NWLinkHints.ts";
import {
  isModifierKey,
  isPageCommand,
  keyToken,
  NW_KEYS_OPEN_IN_BACKGROUND_MESSAGE,
  NW_KEYS_PENDING_MESSAGE,
  NW_KEYS_RUN_IN_PAGE_MESSAGE,
  NW_KEYS_RUN_MESSAGE,
  type NWKeyBinding,
  NWKeyDispatcher,
  type NWPageCommandId,
} from "../common/NWKeymap.ts";

const { setTimeout, clearTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs",
);

const SCROLL_STEP_PX = 64;

// Focused controls where Space means "activate", not a shortcut.
const SPACE_ACTIVATED_SELECTOR =
  "button, a[href], summary, video, audio, [role=button], [role=link], [role=checkbox], [role=tab], [role=menuitem], [role=switch]";

function scrollPageBy(win: Window, top: number): void {
  findScrollableElement(win, false)?.scrollBy({ top });
}

function scrollPageTo(win: Window, edge: "top" | "bottom"): void {
  const target = findScrollableElement(win, false);
  if (!target) {
    return;
  }
  if (edge === "top") {
    target.scrollTo({ top: 0 });
    return;
  }
  target.scrollTo({ top: target.scrollHeight });
}

function isKeyDown(event: Event): event is KeyboardEvent {
  return event.type === "keydown";
}

function isSpaceActivatedFocus(document: Document): boolean {
  return document.activeElement?.closest(SPACE_ACTIVATED_SELECTOR) != null;
}

// Actor listeners sit on the frame's chrome event handler, above the page's
// window, so this capture listener sees keys before any page script.
export class NWKeysChild extends JSWindowActorChild {
  private readonly dispatcher = new NWKeyDispatcher({
    runBinding: (binding) => this.runBinding(binding),
    pendingChanged: (keys) => this.sendAsyncMessage(NW_KEYS_PENDING_MESSAGE, { keys }),
    prefixAbandoned: (keys) => this.replayAbandonedSpace(keys),
    startTimer: (callback, delayMs) => {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    },
  });
  private hintSession: NWLinkHintSession | null = null;
  private spaceTarget: EventTarget | null = null;
  // Set while the lone Space is replayed (replayAbandonedSpace).
  private replayingSpace = false;

  handleEvent(event: Event): void {
    // Our own replayed Space must reach the page untouched. Dispatched by
    // this privileged actor, it is trusted, so the flag tells it apart; taken
    // for a new Space it would start the double-Space sequence again.
    if (!event.isTrusted || this.replayingSpace) {
      return;
    }
    if (event.type === "pagehide") {
      this.resetModes();
      return;
    }
    if (!isKeyDown(event)) {
      return;
    }
    if (this.hintSession) {
      this.hintSession.handleKey(event);
      return;
    }
    this.handleKeyDown(event);
  }

  receiveMessage(message: { name: string; data?: { command?: string } }): void {
    if (message.name !== NW_KEYS_RUN_IN_PAGE_MESSAGE) {
      return;
    }
    const command = message.data?.command;
    if (!command || !isPageCommand(command)) {
      return;
    }
    this.runPageCommand(command);
  }

  didDestroy(): void {
    this.hintSession?.destroy();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const document = this.contentWindow?.document;
    if (!document || event.isComposing || isModifierKey(event)) {
      return;
    }
    if (event.key === "Escape" || this.isTypingContext(event, document)) {
      this.dispatcher.cancel();
      return;
    }
    const token = keyToken(event);
    if (token === "Space") {
      this.spaceTarget = event.target;
    }
    if (this.dispatcher.handleKey(token, event.repeat)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  private isTypingContext(event: KeyboardEvent, document: Document): boolean {
    if (isEditableEvent(event, document)) {
      return true;
    }
    return event.key === " " && isSpaceActivatedFocus(document);
  }

  // A lone Space goes back to the page as an untrusted event: page shortcuts
  // (e.g. video play/pause) still work, but the browser never scrolls.
  private replayAbandonedSpace(keys: string[]): void {
    const target = this.spaceTarget;
    const win = this.contentWindow;
    this.spaceTarget = null;
    if (keys.join(" ") !== "Space" || !target || !win) {
      return;
    }
    this.replayingSpace = true;
    try {
      target.dispatchEvent(
        new win.KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
    } finally {
      this.replayingSpace = false;
    }
  }

  private runBinding(binding: NWKeyBinding): void {
    if (isPageCommand(binding.command)) {
      this.runPageCommand(binding.command);
      return;
    }
    this.sendAsyncMessage(NW_KEYS_RUN_MESSAGE, {
      command: binding.command,
      letter: binding.letter,
    });
  }

  private runPageCommand(command: NWPageCommandId): void {
    const win = this.contentWindow;
    if (!win) {
      return;
    }
    switch (command) {
      case "page:scroll-down":
        return scrollPageBy(win, SCROLL_STEP_PX);
      case "page:scroll-up":
        return scrollPageBy(win, -SCROLL_STEP_PX);
      case "page:scroll-half-page-down":
        return scrollPageBy(win, win.innerHeight / 2);
      case "page:scroll-half-page-up":
        return scrollPageBy(win, -win.innerHeight / 2);
      case "page:scroll-top":
        return scrollPageTo(win, "top");
      case "page:scroll-bottom":
        return scrollPageTo(win, "bottom");
      case "hints:open":
        return this.startHints(win, false);
      case "hints:open-background":
        return this.startHints(win, true);
    }
  }

  private startHints(win: Window, background: boolean): void {
    this.hintSession?.destroy();
    const session = new NWLinkHintSession(win, {
      background,
      openInBackground: (url) =>
        this.sendAsyncMessage(NW_KEYS_OPEN_IN_BACKGROUND_MESSAGE, { url }),
      onFinish: () => {
        this.hintSession = null;
      },
    });
    // A page without clickable elements ends the session immediately.
    if (session.isActive()) {
      this.hintSession = session;
    }
  }

  private resetModes(): void {
    this.dispatcher.cancel();
    this.hintSession?.destroy();
  }
}
