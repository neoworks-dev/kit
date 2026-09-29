/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  isChromeCommand,
  isQuickmarkLetter,
  isValidKeySequence,
  NW_COMMAND_EVENT,
  NW_KEYS_OPEN_IN_BACKGROUND_MESSAGE,
  NW_KEYS_PENDING_EVENT,
  NW_KEYS_PENDING_MESSAGE,
  NW_KEYS_RUN_MESSAGE,
  type NWCommandInvocation,
} from "../common/NWKeymap.ts";

interface BrowserWindow extends Window {
  gBrowser: { selectedBrowser: Element };
  openLinkIn(url: string, where: string, params: Record<string, unknown>): void;
}

interface KeysMessage {
  name: string;
  data?: { command?: unknown; letter?: unknown; url?: unknown; keys?: unknown };
}

function toInvocation(data: KeysMessage["data"]): NWCommandInvocation | null {
  const command = data?.command;
  if (typeof command !== "string" || !isChromeCommand(command)) {
    return null;
  }
  const invocation: NWCommandInvocation = { command };
  if (isQuickmarkLetter(data?.letter)) {
    invocation.letter = data.letter;
  }
  return invocation;
}

// Content processes are untrusted: only the selected tab may run commands, and
// links open with the page's own principal.
export class NWKeysParent extends JSWindowActorParent {
  receiveMessage(message: KeysMessage): void {
    const browserWindow = this.selectedTabWindow();
    if (!browserWindow) {
      return;
    }
    if (message.name === NW_KEYS_RUN_MESSAGE) {
      this.dispatchCommand(browserWindow, message.data);
      return;
    }
    if (message.name === NW_KEYS_OPEN_IN_BACKGROUND_MESSAGE) {
      this.openInBackground(browserWindow, message.data?.url);
      return;
    }
    if (message.name === NW_KEYS_PENDING_MESSAGE) {
      this.dispatchPending(browserWindow, message.data?.keys);
    }
  }

  private dispatchPending(browserWindow: BrowserWindow, keys: unknown): void {
    if (!isValidKeySequence(keys)) {
      return;
    }
    browserWindow.dispatchEvent(
      new browserWindow.CustomEvent(NW_KEYS_PENDING_EVENT, { detail: { keys } }),
    );
  }

  private selectedTabWindow(): BrowserWindow | null {
    const browser = this.browsingContext?.top?.embedderElement;
    const browserWindow = browser?.ownerDocument?.defaultView as BrowserWindow | null | undefined;
    if (!browser || !browserWindow?.gBrowser) {
      return null;
    }
    if (browserWindow.gBrowser.selectedBrowser !== browser) {
      return null;
    }
    return browserWindow;
  }

  private dispatchCommand(browserWindow: BrowserWindow, data: KeysMessage["data"]): void {
    const invocation = toInvocation(data);
    if (!invocation) {
      return;
    }
    browserWindow.dispatchEvent(
      new browserWindow.CustomEvent(NW_COMMAND_EVENT, { detail: invocation }),
    );
  }

  private openInBackground(browserWindow: BrowserWindow, url: unknown): void {
    const principal = this.manager?.documentPrincipal;
    if (typeof url !== "string" || !principal) {
      return;
    }
    browserWindow.openLinkIn(url, "tab", {
      inBackground: true,
      relatedToCurrent: true,
      triggeringPrincipal: principal,
      userContextId: principal.originAttributes.userContextId,
    });
  }
}
