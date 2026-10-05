// SPDX-License-Identifier: MPL-2.0

// "Insert" badge in the URL field while the selected tab is in insert mode,
// i.e. Kit's keys are off and everything goes to the page.

import { createEffect } from "solid-js";
import { selectedTabMode } from "../neoworks-commands/key-mode.ts";

const BADGE_ID = "neoworks-mode-badge";

function createBadge(): Element {
  const badge = document.createXULElement("label");
  badge.id = BADGE_ID;
  badge.setAttribute("value", "Insert");
  badge.setAttribute("tooltiptext", "Insert mode: keys go to the page. Shift+Esc to leave.");
  badge.setAttribute("hidden", "true");
  return badge;
}

// Must run inside a reactive owner (a component's init). Returns a remover
// for hot reload.
export function insertModeBadge(): () => void {
  const pageActionButtons = document.getElementById("page-action-buttons");
  if (!pageActionButtons) {
    console.error("[neoworks-toolbar] #page-action-buttons is missing.");
    return () => {};
  }
  const badge = createBadge();
  pageActionButtons.prepend(badge);
  createEffect(() => {
    if (selectedTabMode() === "insert") {
      badge.removeAttribute("hidden");
      return;
    }
    badge.setAttribute("hidden", "true");
  });
  return () => badge.remove();
}
