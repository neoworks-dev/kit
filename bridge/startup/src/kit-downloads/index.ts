// SPDX-License-Identifier: MPL-2.0

// Kit's about:downloads: Firefox's download list and commands, with a
// summary, search and filters, day headings, and a side panel for where
// files are saved, built around it (layout.ts).

import { formatBytes, KINDS, summarize } from "./catalog.ts";
import { buildPage, type PageParts } from "./layout.ts";
import {
  applyListView,
  downloadInfos,
  fillVisibleRows,
  type ListView,
} from "./list.ts";
import {
  asksWhereToSave,
  chooseDownloadFolder,
  displayPath,
  downloadFolder,
  openDownloadFolder,
  setAsksWhereToSave,
  watchSaving,
} from "./saving.ts";
import { KIT_DOWNLOADS_CSS } from "./theme.ts";
import type { DownloadFilter, DownloadSummary } from "./types.ts";

const THEMED_ATTRIBUTE = "kit-downloads-themed";
const AUTHOR_SHEET = Ci.nsIDOMWindowUtils.AUTHOR_SHEET ?? 2;
// Firefox's command, enabled only while there is something to clear.
const CLEAR_COMMAND_ID = "downloadsCmd_clearDownloads";

interface XULCommand extends Element {
  doCommand(): void;
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

function logFailure(action: string): (error: unknown) => void {
  return (error) => console.error(`[kit-downloads] ${action} failed:`, error);
}

function summaryText(summary: DownloadSummary): string {
  if (summary.count === 0) {
    return "Nothing downloaded yet";
  }
  const parts = [`${summary.count} ${summary.count === 1 ? "file" : "files"}`];
  if (summary.bytes > 0) {
    parts.push(formatBytes(summary.bytes));
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} failed`);
  }
  return parts.join(" · ");
}

function showSummary(
  parts: PageParts,
  summary: DownloadSummary,
  view: ListView,
): void {
  parts.summary.textContent = summaryText(summary);
  parts.clearButton.hidden = summary.count === 0;
  for (const [filter, chip] of parts.chips) {
    const count = filter === "all"
      ? summary.count
      : filter === "failed"
      ? summary.failed
      : summary.byKind[filter].count;
    chip.querySelector(".kit-chip-count")!.textContent = count > 0
      ? String(count)
      : "";
    // Empty kinds have no chip, unless it's the one selected.
    chip.hidden = filter !== "all" && count === 0 && view.filter !== filter;
    chip.toggleAttribute("data-selected", view.filter === filter);
  }
  for (const kind of KINDS) {
    const { count, bytes } = summary.byKind[kind];
    parts.overviewRows.get(kind)!.textContent = count === 0
      ? "None"
      : bytes > 0
      ? `${count} · ${formatBytes(bytes)}`
      : String(count);
  }
}

function showEmptyState(
  parts: PageParts,
  total: number,
  shown: number,
  doc: Document,
): void {
  doc.documentElement?.toggleAttribute("kit-dl-empty", shown === 0);
  if (total === 0) {
    parts.emptyTitle.textContent = "No downloads yet";
    parts.emptyText.textContent = "Files you download show up here.";
    return;
  }
  parts.emptyTitle.textContent = "Nothing matches";
  parts.emptyText.textContent = "Try another search or filter.";
}

async function showSaving(parts: PageParts): Promise<void> {
  const ask = asksWhereToSave();
  parts.askSwitch.checked = ask;
  const path = displayPath(await downloadFolder());
  parts.folderPath.textContent = path;
  parts.folderPath.title = path;
}

function wire(doc: Document, list: Element, parts: PageParts): () => void {
  const view: ListView = { filter: "all", search: "" };
  const win = doc.defaultView!;

  const refresh = (): void => {
    const shown = applyListView(list, view, Date.now());
    const infos = downloadInfos(list);
    showSummary(parts, summarize(infos), view);
    showEmptyState(parts, infos.length, shown, doc);
    // The list may only now have stopped being hidden as empty.
    win.requestAnimationFrame(() => fillVisibleRows(list));
  };

  parts.search.addEventListener("input", () => {
    view.search = parts.search.value;
    refresh();
  });
  for (const [filter, chip] of parts.chips) {
    chip.addEventListener("click", () => {
      view.filter = view.filter === filter ? "all" : (filter as DownloadFilter);
      refresh();
    });
  }
  parts.clearButton.addEventListener("click", () => {
    doc.querySelector<XULCommand>(`#${CLEAR_COMMAND_ID}`)?.doCommand();
  });
  parts.askSwitch.addEventListener(
    "change",
    () => setAsksWhereToSave(parts.askSwitch.checked),
  );
  parts.changeFolderButton.addEventListener("click", () => {
    chooseDownloadFolder(win).catch(
      logFailure("Choosing the downloads folder"),
    );
  });
  parts.openFolderButton.addEventListener("click", () => {
    openDownloadFolder().catch(logFailure("Opening the downloads folder"));
  });

  // Rows come and go, and change state (finished, failed) as they run.
  const observer = new win.MutationObserver(refresh);
  observer.observe(list, {
    childList: true,
    subtree: true,
    attributeFilter: ["state"],
  });
  const stopSaving = watchSaving(() => {
    showSaving(parts).catch(logFailure("Reading the downloads folder"));
  });

  refresh();
  showSaving(parts).catch(logFailure("Reading the downloads folder"));
  return () => {
    observer.disconnect();
    stopSaving();
  };
}

function addLayout(doc: Document): void {
  const list = doc.getElementById("downloadsListBox");
  if (!list || doc.querySelector(".kit-dl-header")) {
    return;
  }
  // Its flex="1" stretches it to the window's height, and xul.css applies
  // that with !important.
  list.removeAttribute("flex");
  const stop = wire(doc, list, buildPage(doc, list));
  doc.defaultView?.addEventListener("unload", stop, { once: true });
}

export function initKitDownloads(doc: Document): void {
  injectTheme(doc);
  const run = (): void => {
    try {
      addLayout(doc);
    } catch (error) {
      console.error(
        "[kit-downloads] Building the downloads page failed:",
        error,
      );
    }
  };
  if (doc.readyState === "loading") {
    doc.defaultView?.addEventListener("DOMContentLoaded", run, { once: true });
    return;
  }
  run();
}
