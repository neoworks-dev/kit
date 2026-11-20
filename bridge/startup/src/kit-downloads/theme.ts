// SPDX-License-Identifier: MPL-2.0

// about:downloads in @neoworks-dev/ui's style (neoworks-tokens.ts): the list
// as a card in a two-column page beside a side panel, pill buttons and
// chips, day headings over the rows. Firefox's own icons, as the page's CSP
// only loads chrome: images.

import { NEOWORKS_TOKENS_CSS } from "../neoworks-tokens.ts";
import { KIT_IN_CONTENT_TOKENS_CSS } from "../kit-preferences/theme.ts";

export const KIT_DOWNLOADS_CSS = KIT_IN_CONTENT_TOKENS_CSS +
  NEOWORKS_TOKENS_CSS + `
:root {
  --kit-icon-search: url("chrome://global/skin/icons/search-glass.svg");
  --kit-icon-folder: url("chrome://global/skin/icons/folder.svg");
  --kit-icon-trash: url("chrome://global/skin/icons/delete.svg");
  --kit-icon-downloads: url("chrome://browser/skin/downloads/downloads.svg");
}

:root {
  scrollbar-color: var(--ui-line-strong) transparent;
}

/* Main column and side panel; the list scrolls, the page doesn't, so the
   list's lazy rows keep filling in as it scrolls. */
#contentAreaDownloadsView {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 280px;
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas:
    "header aside"
    "toolbar aside"
    "list aside";
  column-gap: 64px;
  height: 100vh;
  box-sizing: border-box;
  padding: 48px max(24px, calc((100% - 1120px) / 2)) 24px;
  background: var(--ui-canvas);
  color: var(--ui-text);
  font-family: var(--ui-font-sans);
  font-size: 15px;

  --download-progress-fill-color: var(--ui-fill);
}

@media (max-width: 860px) {
  #contentAreaDownloadsView {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto auto minmax(0, 1fr);
    grid-template-areas: "header" "aside" "toolbar" "list";
    padding-top: 32px;
  }
}

/* ── Header ── */

.kit-dl-header {
  grid-area: header;
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 28px;
}

.kit-dl-titles {
  flex: 1;
  min-width: 0;
}

/* The website's page title ("Profile"). */
.kit-dl-title {
  margin: 0;
  font-size: 40px;
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: -0.035em;
}

.kit-dl-summary {
  margin: 6px 0 0;
  color: var(--ui-text-muted);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

/* ── Buttons (@neoworks-dev/ui Button) ── */

.kit-button {
  appearance: none;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  margin: 0;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: none;
  color: var(--ui-text);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transition: background-color 300ms var(--ui-ease-out), scale 300ms var(--ui-ease-out);
}

.kit-button:active {
  scale: 0.96;
  transition-duration: 100ms;
}

.kit-button:focus-visible,
.kit-chip:focus-visible,
.kit-switch-input:focus-visible + .kit-switch-track {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}

.kit-button-secondary {
  border-color: var(--ui-line-strong);
}

.kit-button-secondary:hover,
.kit-button-ghost:hover {
  background: var(--ui-hover);
}

.kit-button-ghost {
  color: var(--ui-text-muted);
}

.kit-button-ghost:hover {
  color: var(--ui-text);
}

.kit-button-small {
  height: 28px;
  padding: 0 10px;
  font-size: 13px;
}

.kit-button-full {
  width: 100%;
}

.kit-button[data-icon]::before {
  content: "";
  width: 14px;
  height: 14px;
  background-color: currentColor;
  mask: var(--kit-icon) center / contain no-repeat;
}

.kit-button[data-icon="folder"] {
  --kit-icon: var(--kit-icon-folder);
}

.kit-button[data-icon="trash"] {
  --kit-icon: var(--kit-icon-trash);
}

/* ── Search and filters ── */

.kit-dl-toolbar {
  grid-area: toolbar;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.kit-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 240px;
  height: 36px;
  box-sizing: border-box;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--ui-sunken);
  transition: background-color 200ms var(--ui-ease-out), border-color 200ms var(--ui-ease-out);
}

.kit-search:hover {
  background: var(--ui-hover);
}

.kit-search:focus-within {
  border-color: var(--ui-line-strong);
  background: var(--ui-sunken);
}

.kit-search-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  background-color: var(--ui-text-muted);
  mask: var(--kit-icon-search) center / contain no-repeat;
}

.kit-search-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 14px;
}

.kit-search-input::placeholder {
  color: var(--ui-text-faint);
  opacity: 1;
}

.kit-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* @neoworks-dev/ui Chip, filter variant: selected is filled. */
.kit-chip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  margin: 0;
  padding: 0 14px;
  border: 1px solid var(--ui-line-strong);
  border-radius: 999px;
  background: none;
  color: var(--ui-text);
  font: inherit;
  font-size: 14px;
  transition: background-color 300ms var(--ui-ease-out), scale 300ms var(--ui-ease-out);
}

.kit-chip:hover {
  background: var(--ui-hover);
}

.kit-chip:active {
  scale: 0.96;
  transition-duration: 100ms;
}

.kit-chip[data-selected] {
  border-color: transparent;
  background: var(--ui-fill);
  color: var(--ui-on-fill);
}

.kit-chip[data-selected]:hover {
  background: var(--ui-fill-hover);
}

.kit-chip[hidden] {
  display: none;
}

.kit-chip-count {
  color: var(--ui-text-faint);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.kit-chip-count:empty {
  display: none;
}

.kit-chip[data-selected] .kit-chip-count {
  color: inherit;
  opacity: 0.7;
}

/* ── The list: rows on the page, divided by hairlines ── */

#downloadsListBox {
  grid-area: list;
  align-self: start;
  max-height: 100%;
  min-height: 0;
  box-sizing: border-box;
  margin: 0 -12px;
  padding: 0;
  overflow-y: auto;
  border: none;
  background: none;
  color: inherit;
}

:root[kit-dl-empty] #downloadsListBox {
  display: none;
}

#downloadsListBox > richlistitem {
  position: relative;
  min-height: 64px;
  margin: 0;
  padding: 0 4px 0 12px;
  border-radius: var(--ui-radius-control);
  outline: none;
  color: inherit;
  transition: background-color 150ms var(--ui-ease-out);
}

/* The hairline between rows, inset like the rows' content. */
#downloadsListBox > richlistitem:not([data-day])::after {
  content: "";
  position: absolute;
  top: 0;
  inset-inline: 12px;
  height: 1px;
  background: var(--ui-line);
}

#downloadsListBox > richlistitem:hover {
  background: var(--ui-hover);
}

#downloadsListBox > richlistitem[selected] {
  background: var(--ui-sunken);
  color: inherit;
}

#downloadsListBox > richlistitem:is(:hover, [selected])::after,
#downloadsListBox > richlistitem:is(:hover, [selected]) + richlistitem::after {
  opacity: 0;
}

#downloadsListBox:focus-visible > richlistitem[current] {
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
}

/* A day starts a section, like the website's "Your account": a heading
   over a full-width line (list.ts sets data-day). */
#downloadsListBox > richlistitem[data-day] {
  margin-top: 64px;
}

#downloadsListBox > richlistitem[data-day]:first-child {
  margin-top: 52px;
}

#downloadsListBox > richlistitem[data-day]::before {
  content: attr(data-day);
  position: absolute;
  top: -48px;
  inset-inline: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--ui-line);
  color: var(--ui-text);
  font-size: 22px;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.3;
}

#downloadsListBox .downloadTypeIcon {
  width: 32px;
  height: 32px;
  margin: 0 16px 0 0;
}

#downloadsListBox .downloadTarget {
  font-size: 15px;
}

#downloadsListBox .downloadDetails {
  opacity: 1;
  color: var(--ui-text-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

#downloadsListBox richlistitem[state="2"] .downloadDetails,
#downloadsListBox richlistitem[state="3"] .downloadDetails {
  color: var(--ui-danger);
}

#downloadsListBox .downloadProgress {
  height: 4px;
  margin-block: 6px;
  border: none;
  border-radius: 2px;
  background: var(--ui-sunken);
}

#downloadsListBox .downloadProgress::-moz-progress-bar {
  border-radius: 2px;
  background: var(--ui-fill);
}

/* Firefox's row button as a round ghost button. */
#downloadsListBox .downloadButton {
  min-width: 36px;
  min-height: 36px;
  margin-inline-end: 4px;
  border-radius: 50%;
}

#downloadsListBox .downloadButton > .button-box {
  border-radius: 50%;
}

#downloadsListBox .downloadButton:hover > .button-box {
  background: var(--ui-pressed);
}

/* ── Empty states ── */

#downloadsListEmptyDescription {
  display: none !important;
}

.kit-dl-empty {
  grid-area: list;
  align-self: start;
  display: none;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--ui-line);
}

:root[kit-dl-empty] .kit-dl-empty {
  display: flex;
}

.kit-dl-empty-icon {
  width: 28px;
  height: 28px;
  margin-bottom: 10px;
  background-color: var(--ui-text-faint);
  mask: var(--kit-icon-downloads) center / contain no-repeat;
}

.kit-dl-empty-title {
  margin: 0;
  font-size: 22px;
  font-weight: 400;
  letter-spacing: -0.02em;
}

.kit-dl-empty-text {
  margin: 0;
  color: var(--ui-text-muted);
}

/* ── Side column: plain sections, like the website's settings ── */

.kit-dl-aside {
  grid-area: aside;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 48px;
  /* Lines its first heading up with the summary under the title. */
  margin-top: 10px;
}

@media (max-width: 860px) {
  .kit-dl-aside {
    margin: 0 0 32px;
  }
}

.kit-section {
  display: flex;
  flex-direction: column;
}

.kit-section-title {
  margin: 0;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--ui-line);
  font-size: 22px;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.3;
}

.kit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  padding-block: 10px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--ui-line);
  font-size: 15px;
}

.kit-row-label {
  color: var(--ui-text-muted);
}

/* @neoworks-dev/ui Switch. */
.kit-switch {
  position: relative;
  display: flex;
  flex: 1;
  align-items: flex-start;
  gap: 12px;
}

.kit-switch-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
}

.kit-switch-track {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  width: 46px;
  height: 26px;
  box-sizing: border-box;
  margin-top: 1px;
  border: 1px solid var(--ui-line-strong);
  border-radius: 999px;
  background: var(--ui-sunken);
  transition: background-color 300ms var(--ui-ease-out), border-color 300ms var(--ui-ease-out);
}

.kit-switch-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ui-text-muted);
  box-shadow: var(--ui-shadow-lift);
  transform: translateX(3px);
  transition: transform 300ms var(--ui-ease-out), background-color 300ms var(--ui-ease-out),
    scale 300ms var(--ui-ease-out);
}

.kit-switch:active .kit-switch-thumb {
  scale: 1.1;
}

.kit-switch-input:checked + .kit-switch-track {
  border-color: transparent;
  background: var(--ui-fill);
}

.kit-switch-input:checked + .kit-switch-track .kit-switch-thumb {
  background: var(--ui-on-fill);
  transform: translateX(23px);
}

.kit-switch-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kit-switch-label {
  font-size: 15px;
  line-height: 1.35;
}

.kit-switch-supporting {
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.4;
}

.kit-folder-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.kit-folder-path {
  overflow: hidden;
  font-family: var(--ui-font-mono);
  font-size: 13px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.kit-overview-count {
  font-variant-numeric: tabular-nums;
}
`;
