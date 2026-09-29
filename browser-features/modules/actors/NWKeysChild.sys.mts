/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { isKeyboardShortcutEditableFocusEvent } from "./NRKeyboardShortcutFocusChild.sys.mts";
import { findScrollableElement } from "./NRMouseGestureScrollUtils.ts";
import { NWLinkHintSession } from "./NWLinkHints.ts";
import {
  isPageCommand,
  keyToken,
  NW_KEYS_OPEN_IN_BACKGROUND_MESSAGE,
  NW_KEYS_RUN_IN_PAGE_MESSAGE,
  NW_KEYS_RUN_MESSAGE,
  type NWKeyBinding,
  NWKeySequenceMatcher,
  type NWPageCommandId,
} from "../common/NWKeymap.ts";

const SCROLL_STEP_PX = 64;

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

// Actor listeners sit on the frame's chrome event handler, above the page's
// window, so this capture listener sees keys before any page script.
export class NWKeysChild extends JSWindowActorChild {
  private readonly matcher = new NWKeySequenceMatcher();
  private hintSession: NWLinkHintSession | null = null;

  handleEvent(event: Event): void {
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
    const token = keyToken(event);
    if (!document || !token || event.key === "Escape") {
      this.matcher.reset();
      return;
    }
    if (isKeyboardShortcutEditableFocusEvent(event, document)) {
      this.matcher.reset();
      return;
    }
    const decision = this.matcher.handleKey(token, event.repeat, Date.now());
    if (!decision.consume) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (decision.binding) {
      this.runBinding(decision.binding);
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
    this.matcher.reset();
    this.hintSession?.destroy();
  }
}
