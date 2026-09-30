// SPDX-License-Identifier: MPL-2.0

// Whether the AI sidebar is open in this window, and its top bar button. The
// root attribute makes room for the sidebar right of the page (ai.css).

import { createSignal } from "solid-js";
import { connect, connection } from "./chat.ts";

const OPEN_ATTRIBUTE = "nw-ai-open";
const BUTTON_ID = "neoworks-ai-button";

const [open, setOpen] = createSignal(false);

export const aiPanelOpen = open;

function applyOpen(isOpen: boolean): void {
  setOpen(isOpen);
  document.documentElement.toggleAttribute(OPEN_ATTRIBUTE, isOpen);
  const button = document.getElementById(BUTTON_ID);
  if (isOpen) {
    button?.setAttribute("checked", "true");
  } else {
    button?.removeAttribute("checked");
  }
}

export function toggleAiPanel(): void {
  applyOpen(!open());
  const state = connection().kind;
  if (open() && (state === "idle" || state === "failed")) {
    void connect();
  }
}

export function closeAiPanel(): void {
  applyOpen(false);
}

// Next to the downloads button at the right of the top bar. Returns a
// remover for hot reload.
export function insertAiButton(): () => void {
  const customizationTarget = document.getElementById("nav-bar-customization-target");
  if (!customizationTarget) {
    console.error("[neoworks-ai] #nav-bar-customization-target is missing.");
    return () => {};
  }
  const button = document.createXULElement("toolbarbutton");
  button.id = BUTTON_ID;
  button.className = "toolbarbutton-1";
  button.setAttribute("tooltiptext", "AI");
  button.addEventListener("command", toggleAiPanel);
  customizationTarget.after(button);
  return () => {
    button.remove();
    applyOpen(false);
  };
}
