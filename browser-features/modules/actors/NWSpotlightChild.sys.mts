/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { isKeyboardShortcutEditableFocusEvent } from "./NRKeyboardShortcutFocusChild.sys.mts";
import {
  NW_DOUBLE_SPACE_WINDOW_MS,
  NW_SPOTLIGHT_OPEN_MESSAGE,
} from "../common/NWSpotlightTypes.ts";

function isPlainSpace(event: KeyboardEvent): boolean {
  if (event.key !== " " || event.repeat || event.isComposing) {
    return false;
  }
  return !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}

// Actor listeners sit on the frame's chrome event handler, above the page's
// window, so this capture listener runs before any page script sees the key.
export class NWSpotlightChild extends JSWindowActorChild {
  private lastSpaceTime = 0;

  handleEvent(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    const document = this.contentWindow?.document;
    if (!document || !isPlainSpace(keyboardEvent)) {
      this.lastSpaceTime = 0;
      return;
    }
    if (isKeyboardShortcutEditableFocusEvent(keyboardEvent, document)) {
      this.lastSpaceTime = 0;
      return;
    }

    const now = Date.now();
    if (now - this.lastSpaceTime > NW_DOUBLE_SPACE_WINDOW_MS) {
      this.lastSpaceTime = now;
      return;
    }

    this.lastSpaceTime = 0;
    keyboardEvent.preventDefault();
    keyboardEvent.stopImmediatePropagation();
    this.sendAsyncMessage(NW_SPOTLIGHT_OPEN_MESSAGE);
  }
}
