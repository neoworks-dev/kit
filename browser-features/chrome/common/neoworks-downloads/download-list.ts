// SPDX-License-Identifier: MPL-2.0

// Live view of Firefox's download list (public and private), newest first.

import { createSignal } from "solid-js";
import {
  downloadState,
  fileNameOf,
  progressPercent,
  statusText,
} from "./download-format.ts";
import type {
  DownloadEntry,
  DownloadList,
  DownloadListView,
  FirefoxDownload,
} from "./types.ts";

export const { Downloads } = ChromeUtils.importESModule(
  "resource://gre/modules/Downloads.sys.mjs",
) as {
  Downloads: { ALL: string; getList(type: string): Promise<DownloadList> };
};

// The download objects keep their identity, so rendered rows stay in place
// while `revision` re-reads their changing fields.
const [orderedDownloads, setOrderedDownloads] = createSignal<FirefoxDownload[]>([]);
const [revision, setRevision] = createSignal(0);
// A download finished while the panel was closed.
const [attention, setAttention] = createSignal(false);

export const downloadList = orderedDownloads;
export const needsAttention = attention;

export function clearAttention(): void {
  setAttention(false);
}

export function downloadEntry(download: FirefoxDownload): DownloadEntry {
  revision();
  return {
    download,
    fileName: fileNameOf(download.target.path),
    state: downloadState(download),
    progressPercent: progressPercent(download),
    statusText: statusText(download),
  };
}

export function downloadEntries(): DownloadEntry[] {
  return orderedDownloads().map(downloadEntry);
}

function newestFirst(first: FirefoxDownload, second: FirefoxDownload): number {
  return second.startTime.getTime() - first.startTime.getTime();
}

// Returns a stop function for hot reload. `isPanelOpen` decides whether a
// finished download still needs the button's attention dot.
export function watchDownloads(isPanelOpen: () => boolean): () => void {
  const downloads = new Set<FirefoxDownload>();
  const finished = new WeakSet<FirefoxDownload>();
  let list: DownloadList | null = null;
  let stopped = false;
  let refreshQueued = false;

  function refresh(): void {
    refreshQueued = false;
    setOrderedDownloads(Array.from(downloads).sort(newestFirst));
    setRevision((value) => value + 1);
  }

  // Progress events arrive in bursts; one refresh per microtask is enough.
  function queueRefresh(): void {
    if (refreshQueued) {
      return;
    }
    refreshQueued = true;
    queueMicrotask(refresh);
  }

  function noteFinish(download: FirefoxDownload): void {
    if (!download.succeeded || finished.has(download)) {
      return;
    }
    finished.add(download);
    if (!isPanelOpen()) {
      setAttention(true);
    }
  }

  const view: DownloadListView = {
    onDownloadAdded(download) {
      downloads.add(download);
      // Downloads restored at startup are already finished; no dot for them.
      if (download.succeeded) {
        finished.add(download);
      }
      queueRefresh();
    },
    onDownloadChanged(download) {
      noteFinish(download);
      queueRefresh();
    },
    onDownloadRemoved(download) {
      downloads.delete(download);
      queueRefresh();
    },
  };

  Downloads.getList(Downloads.ALL)
    .then(async (downloadList) => {
      if (stopped) {
        return;
      }
      list = downloadList;
      await downloadList.addView(view);
    })
    .catch((error: unknown) => {
      console.error("[neoworks-downloads] Watching downloads failed:", error);
    });

  return () => {
    stopped = true;
    list?.removeView(view).catch((error: unknown) => {
      console.error("[neoworks-downloads] Unwatching downloads failed:", error);
    });
  };
}
