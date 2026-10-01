// SPDX-License-Identifier: MPL-2.0

// The sidebar floats over the page and slides away when not in use. It shows
// while hovered (or its context menu is open) and briefly after keyboard tab
// switching, so the new position in the tab list is visible.

import { createSignal } from "solid-js";

// Window event dispatched by tab:next / tab:previous.
export const SIDEBAR_PEEK_EVENT = "NeoworksSidebarPeek";

const SIDEBAR_ID = "neoworks-sidebar";

const LEAVE_HIDE_DELAY_MS = 300;
const PEEK_DURATION_MS = 1200;

const [visible, setVisible] = createSignal(false);
let hovered = false;
// Menus and popovers currently keeping the sidebar open.
const openMenus = new Set<string>();
let hideTimer: ReturnType<typeof setTimeout> | undefined;

export const sidebarVisible = visible;

// A drag swallows the mouse events: Gecko sends mouseleave when it starts and
// no mouseenter after the drop, so ask the element whether it's hovered.
function isInUse(): boolean {
  if (hovered || openMenus.size > 0) {
    return true;
  }
  return document.getElementById(SIDEBAR_ID)?.matches(":hover") ?? false;
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

export function setSidebarMenuOpen(menuName: string, open: boolean): void {
  if (open) {
    openMenus.add(menuName);
    return;
  }
  openMenus.delete(menuName);
  scheduleHide(LEAVE_HIDE_DELAY_MS);
}

export function disposeSidebarVisibility(): void {
  clearTimeout(hideTimer);
  hovered = false;
  openMenus.clear();
  setVisible(false);
}
