// SPDX-License-Identifier: MPL-2.0

// Kit's about:downloads: Firefox's download list and commands, with a header
// (title, open folder, clear list) and an empty state around it.

import { KIT_DOWNLOADS_CSS } from "./theme.ts";

const XHTML_NS = "http://www.w3.org/1999/xhtml";
const THEMED_ATTRIBUTE = "kit-downloads-themed";
const AUTHOR_SHEET = Ci.nsIDOMWindowUtils.AUTHOR_SHEET ?? 2;
const HEADER_CLASS = "kit-downloads-header";
// Firefox's command, enabled only while there is something to clear.
const CLEAR_COMMAND_ID = "downloadsCmd_clearDownloads";

interface XULCommand extends Element {
  doCommand(): void;
}

function html<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElementNS(XHTML_NS, tag) as HTMLElementTagNameMap[K];
  element.className = className;
  if (text) {
    element.textContent = text;
  }
  return element;
}

// The page's CSP (default-src chrome:) blocks inline <style>; a sheet loaded
// through windowUtils isn't subject to it.
function injectTheme(doc: Document): void {
  const utils = doc.defaultView?.windowUtils;
  if (!utils || doc.documentElement?.hasAttribute(THEMED_ATTRIBUTE)) {
    return;
  }
  doc.documentElement?.setAttribute(THEMED_ATTRIBUTE, "");
  utils.loadSheetUsingURIString(
    "data:text/css;charset=utf-8," + encodeURIComponent(KIT_DOWNLOADS_CSS),
    AUTHOR_SHEET,
  );
}

// Imported on use: this script also runs in about:preferences.
async function openDownloadsFolder(): Promise<void> {
  const { Downloads } = ChromeUtils.importESModule(
    "resource://gre/modules/Downloads.sys.mjs",
  ) as { Downloads: { getPreferredDownloadsDirectory(): Promise<string> } };
  const { DownloadsCommon } = ChromeUtils.importESModule(
    "moz-src:///browser/components/downloads/DownloadsCommon.sys.mjs",
  ) as { DownloadsCommon: { showDirectory(directory: nsIFile): void } };
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(await Downloads.getPreferredDownloadsDirectory());
  DownloadsCommon.showDirectory(file);
}

function button(doc: Document, className: string, label: string, onClick: () => void) {
  const element = html(doc, "button", `kit-downloads-button ${className}`, label);
  element.type = "button";
  element.addEventListener("click", onClick);
  return element;
}

function openFolderButton(doc: Document): HTMLButtonElement {
  return button(doc, "kit-downloads-open-folder", "Open folder", () => {
    openDownloadsFolder().catch((error: unknown) => {
      console.error("[kit-downloads] Opening the downloads folder failed:", error);
    });
  });
}

function buildHeader(doc: Document): HTMLElement {
  const header = html(doc, "header", HEADER_CLASS);
  header.append(
    html(doc, "h1", "kit-downloads-title", "Downloads"),
    openFolderButton(doc),
    button(doc, "kit-downloads-clear", "Clear list", () => {
      doc.querySelector<XULCommand>(`#${CLEAR_COMMAND_ID}`)?.doCommand();
    }),
  );
  return header;
}

function buildEmptyState(doc: Document): HTMLElement {
  const empty = html(doc, "div", "kit-downloads-empty");
  empty.append(
    html(doc, "div", "kit-downloads-empty-icon"),
    html(doc, "h2", "kit-downloads-empty-title", "No downloads yet"),
    html(doc, "p", "kit-downloads-empty-text", "Files you download show up here."),
  );
  return empty;
}

function addLayout(doc: Document): void {
  const list = doc.getElementById("downloadsListBox");
  if (!list || doc.querySelector(`.${HEADER_CLASS}`)) {
    return;
  }
  // Its flex="1" stretches it to the window's height, and xul.css applies
  // that with !important.
  list.removeAttribute("flex");
  list.before(buildHeader(doc));
  // After the list, so CSS can hide it once the list has rows.
  doc.getElementById("downloadsListEmptyDescription")?.after(buildEmptyState(doc));
}

export function initKitDownloads(doc: Document): void {
  injectTheme(doc);
  const run = (): void => {
    try {
      addLayout(doc);
    } catch (error) {
      console.error("[kit-downloads] Building the downloads page failed:", error);
    }
  };
  if (doc.readyState === "loading") {
    doc.defaultView?.addEventListener("DOMContentLoaded", run, { once: true });
    return;
  }
  run();
}
