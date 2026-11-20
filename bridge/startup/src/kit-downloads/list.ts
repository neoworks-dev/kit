// SPDX-License-Identifier: MPL-2.0

// Firefox's download rows (allDownloadsView.js): which ones show for the
// search and filter, and the day each group of rows starts.

import { dayLabel, describeDownload, matchesFilter } from "./catalog.ts";
import type { DownloadFilter, DownloadInfo, FirefoxDownload } from "./types.ts";

interface DownloadRow extends Element {
  hidden: boolean;
  _shell?: {
    download: FirefoxDownload;
    matchesSearchTerm(term: string): boolean;
  };
}

interface DownloadList extends Element {
  _placesView?: { _ensureVisibleElementsAreActive?(): void };
}

export interface ListView {
  filter: DownloadFilter;
  search: string;
}

function rows(list: Element): DownloadRow[] {
  return [...list.children].filter((child): child is DownloadRow =>
    !!(child as DownloadRow)._shell
  );
}

export function downloadInfos(list: Element): DownloadInfo[] {
  return rows(list).map((row) => describeDownload(row._shell!.download));
}

// Returns how many rows show.
export function applyListView(
  list: Element,
  view: ListView,
  now: number,
): number {
  const search = view.search.trim();
  let shown = 0;
  let previousDay = "";
  for (const row of rows(list)) {
    const shell = row._shell!;
    const info = describeDownload(shell.download);
    const show = matchesFilter(info, view.filter) &&
      (!search || shell.matchesSearchTerm(search));
    row.hidden = !show;
    if (!show) {
      row.removeAttribute("data-day");
      continue;
    }
    shown += 1;
    const day = dayLabel(info.time, now);
    if (day === previousDay) {
      row.removeAttribute("data-day");
    } else {
      row.setAttribute("data-day", day);
    }
    previousDay = day;
  }
  return shown;
}

// Rows fill in their name and icons only once on screen, and the view only
// checks on scroll. Call once the list is laid out.
export function fillVisibleRows(list: Element): void {
  (list as DownloadList)._placesView?._ensureVisibleElementsAreActive?.();
}
