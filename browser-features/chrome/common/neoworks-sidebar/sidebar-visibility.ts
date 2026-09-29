// SPDX-License-Identifier: MPL-2.0

// The sidebar floats over the page and slides away when not in use. It shows
// while hovered (or its context menu is open) and briefly after keyboard tab
// switching, so the new position in the tab list is visible.

import { createSignal } from "solid-js";

// Window event dispatched by tab:next / tab:previous.
export const SIDEBAR_PEEK_EVENT = "NeoworksSidebarPeek";

const LEAVE_HIDE_DELAY_MS = 300;
const PEEK_DURATION_MS = 1200;

const [visible, setVisible] = createSignal(false);
let hovered = false;
let menuOpen = false;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

export const sidebarVisible = visible;

function isInUse(): boolean {
  return hovered || menuOpen;
}

function scheduleHide(delayMs: number): void {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!isInUse()) {
      setVisible(false);
    }
  }, delayMs);
}

function reveal(): void {
  clearTimeout(hideTimer);
  setVisible(true);
}

export function peekSidebar(): void {
  reveal();
  scheduleHide(PEEK_DURATION_MS);
}

export function handleSidebarEnter(): void {
  hovered = true;
  reveal();
}

export function handleSidebarLeave(): void {
  hovered = false;
  scheduleHide(LEAVE_HIDE_DELAY_MS);
}

export function setSidebarMenuOpen(open: boolean): void {
  menuOpen = open;
  if (!open) {
    scheduleHide(LEAVE_HIDE_DELAY_MS);
  }
}

export function disposeSidebarVisibility(): void {
  clearTimeout(hideTimer);
  hovered = false;
  menuOpen = false;
  setVisible(false);
}
