// SPDX-License-Identifier: MPL-2.0

const BUTTON_ID = "neoworks-page-actions-button";

export function pageActionsButton(): Element | null {
  return document.getElementById(BUTTON_ID);
}

// Lives inside #urlbar-container rather than as a CustomizableUI widget, so
// customize mode can't move or drop it. Returns a remover for hot reload.
export function insertPageActionsButton(onActivate: (button: Element) => void): () => void {
  const urlbarContainer = document.getElementById("urlbar-container");
  if (!urlbarContainer) {
    console.error("[neoworks-toolbar] #urlbar-container is missing.");
    return () => {};
  }
  const button = document.createXULElement("toolbarbutton");
  button.id = BUTTON_ID;
  button.className = "toolbarbutton-1";
  button.setAttribute("tooltiptext", "Page actions");
  button.addEventListener("command", () => onActivate(button));
  urlbarContainer.append(button);
  return () => button.remove();
}
