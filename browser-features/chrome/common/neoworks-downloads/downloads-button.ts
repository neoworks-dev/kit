// SPDX-License-Identifier: MPL-2.0

// Kit's downloads button in the top bar. It replaces Firefox's, which Kit
// hides (neoworks-toolbar/toolbar.css), and appears once there is a download.

import { overallProgress } from "./download-format.ts";
import { downloadList, needsAttention } from "./download-list.ts";

const BUTTON_ID = "neoworks-downloads-button";
const PROGRESS_PROPERTY = "--nw-download-progress";

export function downloadsButton(): Element | null {
  return document.getElementById(BUTTON_ID);
}

// Right after the customizable buttons, but outside CustomizableUI's area so
// customize mode can't move or drop it. Returns a remover for hot reload.
export function insertDownloadsButton(onActivate: (button: Element) => void): () => void {
  const customizationTarget = document.getElementById("nav-bar-customization-target");
  if (!customizationTarget) {
    console.error("[neoworks-downloads] #nav-bar-customization-target is missing.");
    return () => {};
  }
  const button = document.createXULElement("toolbarbutton");
  button.id = BUTTON_ID;
  button.className = "toolbarbutton-1";
  button.setAttribute("tooltiptext", "Downloads");
  button.addEventListener("command", () => onActivate(button));
  customizationTarget.after(button);
  return () => button.remove();
}

function toggleAttribute(element: Element, name: string, enabled: boolean): void {
  if (enabled) {
    element.setAttribute(name, "true");
    return;
  }
  element.removeAttribute(name);
}

// Hidden without downloads; a progress line while downloading; a dot once a
// download finished unseen. Call inside an effect so it re-runs on changes.
export function syncDownloadsButton(): void {
  const button = downloadsButton();
  if (!button) {
    return;
  }
  const downloads = downloadList();
  const progress = overallProgress(downloads);
  toggleAttribute(button, "hidden", downloads.length === 0);
  toggleAttribute(button, "nw-downloading", progress !== null);
  toggleAttribute(button, "nw-attention", needsAttention());
  if (progress !== null) {
    (button as XULElement).style.setProperty(PROGRESS_PROPERTY, `${progress}%`);
  }
}
