// SPDX-License-Identifier: MPL-2.0

// Shows when the selected tab is in insert mode, i.e. Kit's keys are off and
// everything goes to the page.

import { Show } from "solid-js";
import { selectedTabMode } from "./key-mode.ts";
import glassStyle from "../neoworks-ui/glass.css?inline";
import modeIndicatorStyle from "./mode-indicator.css?inline";

// solid-xul removes the attribute when the value is undefined.
function openFlag(): string | undefined {
  if (selectedTabMode() === "insert") {
    return "true";
  }
  return undefined;
}

export function ModeIndicator() {
  return (
    <div id="neoworks-mode-indicator" data-open={openFlag()}>
      <style>{glassStyle + modeIndicatorStyle}</style>
      <Show when={selectedTabMode() === "insert"}>
        <span class="nw-mode-indicator-name">Insert</span>
        <kbd class="nw-mode-indicator-key">Shift Esc</kbd>
        <span class="nw-mode-indicator-hint">to leave</span>
      </Show>
    </div>
  );
}
