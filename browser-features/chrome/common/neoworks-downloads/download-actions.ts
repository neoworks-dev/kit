// SPDX-License-Identifier: MPL-2.0

// What the downloads panel's buttons do, following Firefox's own panel
// (DownloadsViewUI) so downloads behave the same in both.

import { defaultContainerId } from "../neoworks-sidebar/containers.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import { Downloads } from "./download-list.ts";
import type { FirefoxDownload } from "./types.ts";

const { DownloadsCommon } = ChromeUtils.importESModule(
  "moz-src:///browser/components/downloads/DownloadsCommon.sys.mjs",
) as {
  DownloadsCommon: {
    openDownload(download: FirefoxDownload): Promise<void>;
    showDownloadedFile(file: nsIFile): void;
    deleteDownload(download: FirefoxDownload): Promise<void>;
  };
};

const ALL_DOWNLOADS_URL = "about:downloads";

function logFailure(action: string): (error: unknown) => void {
  return (error) => console.error(`[neoworks-downloads] ${action} failed:`, error);
}

export function openDownloadedFile(download: FirefoxDownload): void {
  DownloadsCommon.openDownload(download).catch(logFailure("Opening the file"));
}

export function showInFolder(download: FirefoxDownload): void {
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(download.target.path);
  DownloadsCommon.showDownloadedFile(file);
}

// Canceling a download that keeps its partial data is Firefox's pause.
export function pauseDownload(download: FirefoxDownload): void {
  download.cancel().catch(logFailure("Pausing"));
}

// Resumes a paused download and retries a failed or canceled one.
export function restartDownload(download: FirefoxDownload): void {
  download.start().catch(logFailure("Restarting"));
}

export function cancelDownload(download: FirefoxDownload): void {
  download.cancel().catch(logFailure("Canceling"));
  download.removePartialData().catch(logFailure("Removing partial data"));
}

// Forgets the download (list and history); the file stays on disk.
export function removeDownload(download: FirefoxDownload): void {
  DownloadsCommon.deleteDownload(download).catch(logFailure("Removing"));
}

export function clearFinishedDownloads(): void {
  Downloads.getList(Downloads.ALL)
    .then((list) => list.removeFinished())
    .catch(logFailure("Clearing the list"));
}

export function openAllDownloads(): void {
  const browser = tabbrowser();
  browser.selectedTab = browser.addTrustedTab(ALL_DOWNLOADS_URL, {
    userContextId: defaultContainerId(),
  });
}
