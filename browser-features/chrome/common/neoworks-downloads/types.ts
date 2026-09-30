// SPDX-License-Identifier: MPL-2.0

// The fields of Firefox's Download object (DownloadCore.sys.mjs) that decide
// how a download is shown.
export interface DownloadStatus {
  stopped: boolean;
  succeeded: boolean;
  error: { becauseBlocked?: boolean } | null;
  hasPartialData: boolean;
  hasProgress: boolean;
  // 0-100, meaningful only with hasProgress.
  progress: number;
  currentBytes: number;
  totalBytes: number;
  // Bytes per second while downloading.
  speed: number;
  source: { url: string };
  target: { path: string; exists?: boolean };
}

export interface FirefoxDownload extends DownloadStatus {
  startTime: Date;
  // Pausing is only possible when Firefox keeps the partial file.
  tryToKeepPartialData: boolean;
  start(): Promise<void>;
  cancel(): Promise<void>;
  removePartialData(): Promise<void>;
}

export interface DownloadListView {
  onDownloadAdded(download: FirefoxDownload): void;
  onDownloadChanged(download: FirefoxDownload): void;
  onDownloadRemoved(download: FirefoxDownload): void;
}

export interface DownloadList {
  addView(view: DownloadListView): Promise<void>;
  removeView(view: DownloadListView): Promise<void>;
  removeFinished(): void;
}

export type DownloadState = "downloading" | "paused" | "done" | "failed" | "canceled";

// A plain snapshot of a download for rendering; `download` backs the actions.
export interface DownloadEntry {
  download: FirefoxDownload;
  fileName: string;
  state: DownloadState;
  // 0-100, or null when the size is unknown.
  progressPercent: number | null;
  statusText: string;
}
