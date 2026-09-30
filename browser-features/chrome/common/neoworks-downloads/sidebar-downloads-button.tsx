// SPDX-License-Identifier: MPL-2.0

// The downloads button in the sidebar footer. Same states as the top bar's
// (downloads-button.ts), which only shows while the sidebar floats.

import { overallProgress } from "./download-format.ts";
import { downloadList, needsAttention } from "./download-list.ts";
import { toggleDownloadsPanel } from "./downloads-panel.tsx";

export const SIDEBAR_DOWNLOADS_BUTTON_ID = "neoworks-sidebar-downloads";

function flag(enabled: boolean): string | undefined {
  if (enabled) {
    return "true";
  }
  return undefined;
}

export function SidebarDownloadsButton() {
  const progress = () => overallProgress(downloadList());
  return (
    <button
      type="button"
      id={SIDEBAR_DOWNLOADS_BUTTON_ID}
      class="nw-icon-button nw-footer-button"
      title="Downloads"
      data-downloading={flag(progress() !== null)}
      data-attention={flag(needsAttention() && progress() === null)}
      style={{ "--nw-download-progress": `${progress() ?? 0}%` }}
      onClick={(event: MouseEvent) => toggleDownloadsPanel(event.currentTarget as Element)}
    >
      <span class="nw-icon" data-icon="download-simple" />
    </button>
  );
}
