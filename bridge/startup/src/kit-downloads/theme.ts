// SPDX-License-Identifier: MPL-2.0

// about:downloads in Kit's style: Firefox's list as a card in a centered
// column under a header, and a proper empty state instead of one line of
// text. Firefox's own icons, as the page's CSP only loads chrome: images.

import { KIT_IN_CONTENT_TOKENS_CSS } from "../kit-preferences/theme.ts";

export const KIT_DOWNLOADS_CSS = KIT_IN_CONTENT_TOKENS_CSS + `
#contentAreaDownloadsView {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px 24px;
  background: var(--background-color-canvas);
  color: var(--text-color);
  font-size: 13px;

  --download-progress-fill-color: var(--text-color);
}

#contentAreaDownloadsView > :is(.kit-downloads-header, #downloadsListBox, .kit-downloads-empty) {
  width: 100%;
  max-width: 760px;
  box-sizing: border-box;
}

.kit-downloads-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-inline: 4px;
}

.kit-downloads-title {
  flex: 1;
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.kit-downloads-button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  margin: 0;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-medium);
  background: var(--button-background-color);
  color: var(--text-color);
  font: inherit;
  font-weight: 500;
}

.kit-downloads-button:hover {
  background: var(--button-background-color-hover);
}

.kit-downloads-button:hover:active {
  background: var(--button-background-color-active);
}

.kit-downloads-button:focus-visible {
  outline: 2px solid var(--focus-outline-color);
  outline-offset: 2px;
}

.kit-downloads-button::before {
  content: "";
  width: 14px;
  height: 14px;
  background-color: currentColor;
  mask: var(--kit-downloads-icon) center / contain no-repeat;
}

.kit-downloads-open-folder {
  --kit-downloads-icon: url("chrome://global/skin/icons/folder.svg");
}

.kit-downloads-clear {
  --kit-downloads-icon: url("chrome://global/skin/icons/delete.svg");
}

/* Nothing to clear. */
#contentAreaDownloadsView:has(#downloadsListBox:empty) .kit-downloads-clear {
  display: none;
}

/* Shrinks to its rows; scrolls once they fill the window. */
#downloadsListBox {
  flex: 0 1 auto;
  min-height: 0;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid var(--card-border-color);
  border-radius: var(--card-border-radius);
  background: var(--card-background-color);
  color: inherit;
}

#downloadsListBox > richlistitem {
  min-height: 56px;
  margin-bottom: 2px;
  padding-inline: 4px 0;
  border-radius: var(--border-radius-medium);
  color: inherit;
}

#downloadsListBox > richlistitem:last-child {
  margin-bottom: 0;
}

/* A quiet ring instead of the dotted focus outline. */
#downloadsListBox > richlistitem {
  outline: none;
}

#downloadsListBox:focus-visible > richlistitem[current] {
  outline: 1px solid var(--focus-outline-color);
  outline-offset: -1px;
}

#downloadsListBox > richlistitem:hover {
  background: var(--page-nav-button-background-color-hover);
}

#downloadsListBox > richlistitem[selected] {
  background: var(--page-nav-button-background-color-selected);
  color: inherit;
}

#downloadsListBox.allDownloadsListBox richlistitem[selected] .downloadProgress::-moz-progress-bar {
  --download-progress-fill-color: var(--text-color);
}

#downloadsListBox .downloadTypeIcon {
  width: 28px;
  height: 28px;
  margin: 0 12px 0 8px;
}

#downloadsListBox .downloadTarget {
  font-weight: 500;
}

#downloadsListBox .downloadDetails {
  opacity: 1;
  color: var(--text-color-deemphasized);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

#downloadsListBox .downloadButton > .button-box {
  border-radius: var(--border-radius-small);
}

/* Kit's empty state replaces Firefox's one-line description. */
#downloadsListEmptyDescription,
#downloadsListBox:not(:empty) ~ .kit-downloads-empty {
  display: none !important;
}

.kit-downloads-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 96px 24px;
  border: 1px dashed var(--border-color-interactive);
  border-radius: var(--card-border-radius);
  text-align: center;
}

.kit-downloads-empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 10px;
  border-radius: 50%;
  background: var(--background-color-box-info);
}

.kit-downloads-empty-icon::before {
  content: "";
  width: 24px;
  height: 24px;
  background-color: var(--text-color-deemphasized);
  mask: url("chrome://browser/skin/downloads/downloads.svg") center / contain no-repeat;
}

.kit-downloads-empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.kit-downloads-empty-text {
  margin: 0;
  color: var(--text-color-deemphasized);
}
`;
