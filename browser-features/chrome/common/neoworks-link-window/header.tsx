// SPDX-License-Identifier: MPL-2.0

import { page, runOpenInMainWindow } from "./minimal-window.ts";

// Host and path without the scheme, like the URL bar shows it.
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

const IS_MAC = Services.appinfo.OS === "Darwin";

function shortcutLabel(): string {
  if (IS_MAC) {
    return "⌘↩";
  }
  return "Ctrl+Enter";
}

export function LinkWindowHeader() {
  return (
    <div id="neoworks-link-window-header">
      <div class="nw-link-window-titles">
        <span class="nw-link-window-title">{page().title}</span>
        <span class="nw-link-window-url">{displayUrl(page().url)}</span>
      </div>
      <button
        type="button"
        class="nw-link-window-open"
        title={`Move this page into a tab in the main window (${shortcutLabel()})`}
        onClick={runOpenInMainWindow}
      >
        <span class="nw-icon" data-icon="arrow-square-in" />
        <span>Open in Kit</span>
      </button>
      <button
        type="button"
        class="nw-link-window-close"
        title="Close"
        onClick={() => window.close()}
      >
        <span class="nw-icon" data-icon="x" />
      </button>
    </div>
  );
}
