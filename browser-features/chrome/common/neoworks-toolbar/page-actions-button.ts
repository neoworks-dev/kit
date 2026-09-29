// SPDX-License-Identifier: MPL-2.0

const BUTTON_ID = "neoworks-page-actions-button";

export function pageActionsButton(): Element | null {
  return document.getElementById(BUTTON_ID);
}

// Sits at the right end of the URL field, with Firefox's page action icons,
// rather than as a CustomizableUI widget, so customize mode can't move or
// drop it. Returns a remover for hot reload.
export function insertPageActionsButton(onActivate: (button: Element) => void): () => void {
  const pageActionButtons = document.getElementById("page-action-buttons");
  if (!pageActionButtons) {
    console.error("[neoworks-toolbar] #page-action-buttons is missing.");
    return () => {};
  }
  const button = document.createXULElement("toolbarbutton");
  button.id = BUTTON_ID;
  button.className = "toolbarbutton-1";
  button.setAttribute("tooltiptext", "Page actions");
  button.addEventListener("command", () => onActivate(button));
  pageActionButtons.append(button);
  return () => button.remove();
}
