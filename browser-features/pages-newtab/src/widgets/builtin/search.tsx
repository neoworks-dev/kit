// SPDX-License-Identifier: MPL-2.0

import { Icon } from "../../components/controls.tsx";
import { openSpotlight } from "../../lib/browser.ts";
import { defineWidget } from "../registry.ts";

// A launcher for spotlight rather than a second search box, so search,
// history, commands and quickmarks work the same as with Ctrl+T.
function SearchLauncher() {
  return (
    <button
      type="button"
      onClick={openSpotlight}
      class="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left text-sm text-dim transition-colors duration-120 hover:border-line-strong hover:bg-hover hover:text-muted"
    >
      <Icon name="magnifying-glass" />
      <span class="flex-1 truncate">Search or enter address</span>
      <kbd class="rounded-sm border border-line px-1.5 py-0.5 font-mono text-xs text-faint">
        Ctrl T
      </kbd>
    </button>
  );
}

export const searchWidget = defineWidget<Record<string, never>>({
  type: "kit.search",
  title: "Search",
  description: "Opens spotlight to search or go to an address.",
  sizes: ["medium", "full"],
  defaultSize: "full",
  defaultSettings: {},
  component: SearchLauncher,
});
