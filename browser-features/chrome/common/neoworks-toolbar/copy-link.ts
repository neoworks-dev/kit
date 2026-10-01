// SPDX-License-Identifier: MPL-2.0

// Copy the page's link: page:copy-url (y y, the spotlight, the page actions
// menu) and Ctrl+Shift+C (Cmd+Shift+C on macOS).
//
// DevTools binds the same keys to its element picker through a XUL <key>.
// Key elements skip events whose default was prevented, and this capturing
// listener on the window runs before them and before the key is forwarded to
// a page, so Kit's binding wins everywhere in the window.

import { copyPageUrl } from "./page-actions.ts";
import { showToast } from "./toast.tsx";

const IS_MAC = Services.appinfo.OS === "Darwin";

export function copyPageLink(): void {
  copyPageUrl();
  showToast("Copied link");
}

function isCopyLinkShortcut(event: KeyboardEvent): boolean {
  if (event.code !== "KeyC" || !event.shiftKey || event.altKey) {
    return false;
  }
  if (IS_MAC) {
    return event.metaKey && !event.ctrlKey;
  }
  return event.ctrlKey && !event.metaKey;
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!isCopyLinkShortcut(event)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.repeat) {
    return;
  }
  try {
    copyPageLink();
  } catch (error) {
    console.error("[neoworks-toolbar] Copying the link failed:", error);
  }
}

// Returns a stop function for hot reload.
export function listenForCopyLinkShortcut(): () => void {
  addEventListener("keydown", handleKeyDown, true);
  return () => removeEventListener("keydown", handleKeyDown, true);
}
