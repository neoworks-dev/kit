// SPDX-License-Identifier: MPL-2.0

// The parts Kit adds around Firefox's download list: a header with a
// summary, search and filter chips, a side panel with where files are saved
// and what's in the list, and the empty states. Built once; index.ts fills
// in the numbers.

import { KIND_LABELS, KINDS } from "./catalog.ts";
import type { DownloadFilter } from "./types.ts";

const XHTML_NS = "http://www.w3.org/1999/xhtml";

export const FILTERS: { filter: DownloadFilter; label: string }[] = [
  { filter: "all", label: "All" },
  ...KINDS.map((kind) => ({ filter: kind, label: KIND_LABELS[kind] })),
  { filter: "failed", label: "Failed" },
];

export interface PageParts {
  summary: HTMLElement;
  clearButton: HTMLButtonElement;
  search: HTMLInputElement;
  chips: Map<DownloadFilter, HTMLButtonElement>;
  askSwitch: HTMLInputElement;
  folderPath: HTMLElement;
  changeFolderButton: HTMLButtonElement;
  openFolderButton: HTMLButtonElement;
  overviewRows: Map<string, HTMLElement>;
  emptyTitle: HTMLElement;
  emptyText: HTMLElement;
}

function html<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElementNS(
    XHTML_NS,
    tag,
  ) as HTMLElementTagNameMap[K];
  element.className = className;
  if (text) {
    element.textContent = text;
  }
  return element;
}

// `icon` names a --kit-icon-* mask in theme.ts.
function button(
  doc: Document,
  className: string,
  label: string,
  icon?: string,
) {
  const element = html(doc, "button", `kit-button ${className}`, label);
  element.type = "button";
  if (icon) {
    element.dataset.icon = icon;
  }
  return element;
}

function buildHeader(doc: Document, parts: Partial<PageParts>): HTMLElement {
  const header = html(doc, "header", "kit-dl-header");
  const titles = html(doc, "div", "kit-dl-titles");
  parts.summary = html(doc, "p", "kit-dl-summary");
  titles.append(html(doc, "h1", "kit-dl-title", "Downloads"), parts.summary);
  parts.clearButton = button(
    doc,
    "kit-button-secondary",
    "Clear list",
    "trash",
  );
  header.append(titles, parts.clearButton);
  return header;
}

function buildToolbar(doc: Document, parts: Partial<PageParts>): HTMLElement {
  const toolbar = html(doc, "div", "kit-dl-toolbar");
  const search = html(doc, "label", "kit-search");
  parts.search = html(doc, "input", "kit-search-input");
  parts.search.type = "search";
  parts.search.placeholder = "Search downloads";
  search.append(html(doc, "span", "kit-search-icon"), parts.search);

  const chips = html(doc, "div", "kit-chips");
  parts.chips = new Map();
  for (const { filter, label } of FILTERS) {
    const chip = button(doc, "kit-chip", label);
    chip.dataset.filter = filter;
    chip.append(html(doc, "span", "kit-chip-count"));
    parts.chips.set(filter, chip);
    chips.append(chip);
  }
  toolbar.append(search, chips);
  return toolbar;
}

function buildSavingSection(
  doc: Document,
  parts: Partial<PageParts>,
): HTMLElement {
  const section = html(doc, "section", "kit-section");
  section.append(html(doc, "h2", "kit-section-title", "Saving"));

  const switchRow = html(doc, "label", "kit-switch");
  parts.askSwitch = html(doc, "input", "kit-switch-input");
  parts.askSwitch.type = "checkbox";
  parts.askSwitch.setAttribute("role", "switch");
  const track = html(doc, "span", "kit-switch-track");
  track.append(html(doc, "span", "kit-switch-thumb"));
  const text = html(doc, "span", "kit-switch-text");
  text.append(
    html(doc, "span", "kit-switch-label", "Ask where to save each file"),
    html(
      doc,
      "span",
      "kit-switch-supporting",
      "Otherwise files go straight to the folder below.",
    ),
  );
  switchRow.append(parts.askSwitch, track, text);

  const folder = html(doc, "div", "kit-row kit-folder");
  const folderText = html(doc, "div", "kit-folder-text");
  parts.folderPath = html(doc, "span", "kit-folder-path");
  folderText.append(
    html(doc, "span", "kit-row-label", "Save to"),
    parts.folderPath,
  );
  parts.changeFolderButton = button(
    doc,
    "kit-button-secondary kit-button-small",
    "Change",
  );
  folder.append(folderText, parts.changeFolderButton);

  const open = html(doc, "div", "kit-row");
  parts.openFolderButton = button(
    doc,
    "kit-button-secondary kit-button-small",
    "Open folder",
    "folder",
  );
  open.append(
    html(doc, "span", "kit-row-label", "In your files"),
    parts.openFolderButton,
  );

  const ask = html(doc, "div", "kit-row");
  ask.append(switchRow);
  section.append(ask, folder, open);
  return section;
}

function buildOverviewSection(
  doc: Document,
  parts: Partial<PageParts>,
): HTMLElement {
  const section = html(doc, "section", "kit-section");
  section.append(html(doc, "h2", "kit-section-title", "In this list"));
  parts.overviewRows = new Map();
  for (const kind of KINDS) {
    const row = html(doc, "div", "kit-row");
    row.dataset.kind = kind;
    const count = html(doc, "span", "kit-overview-count");
    row.append(html(doc, "span", "kit-row-label", KIND_LABELS[kind]), count);
    parts.overviewRows.set(kind, count);
    section.append(row);
  }
  return section;
}

function buildEmptyState(
  doc: Document,
  parts: Partial<PageParts>,
): HTMLElement {
  const empty = html(doc, "div", "kit-dl-empty");
  parts.emptyTitle = html(doc, "h2", "kit-dl-empty-title");
  parts.emptyText = html(doc, "p", "kit-dl-empty-text");
  empty.append(
    html(doc, "div", "kit-dl-empty-icon"),
    parts.emptyTitle,
    parts.emptyText,
  );
  return empty;
}

// Grid siblings of the list (theme.ts places them); the list itself stays
// where Firefox put it, so its view keeps working.
export function buildPage(doc: Document, list: Element): PageParts {
  const parts: Partial<PageParts> = {};
  list.before(buildHeader(doc, parts), buildToolbar(doc, parts));
  const aside = html(doc, "aside", "kit-dl-aside");
  aside.append(
    buildSavingSection(doc, parts),
    buildOverviewSection(doc, parts),
  );
  list.after(buildEmptyState(doc, parts), aside);
  return parts as PageParts;
}
