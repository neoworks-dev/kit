// SPDX-License-Identifier: MPL-2.0

export type DownloadKind = "document" | "image" | "media" | "archive" | "other";

// What the filter chips show: everything, one kind, or what went wrong.
export type DownloadFilter = "all" | DownloadKind | "failed";

// One row of Firefox's list, read from its download.
export interface DownloadInfo {
  name: string;
  kind: DownloadKind;
  // Failed or canceled.
  failed: boolean;
  // Bytes on disk; 0 while unknown.
  size: number;
  // When it finished or, for running ones, started; ms since the epoch.
  time: number;
}

export interface DownloadSummary {
  count: number;
  bytes: number;
  failed: number;
  byKind: Record<DownloadKind, { count: number; bytes: number }>;
}

// The parts of Firefox's Download and HistoryDownload the page reads
// (DownloadCore.sys.mjs, DownloadHistory.sys.mjs).
export interface FirefoxDownload {
  source?: { url?: string };
  target: { path?: string; size?: number };
  startTime?: Date | number;
  endTime?: number;
  succeeded?: boolean;
  canceled?: boolean;
  error?: unknown;
  totalBytes?: number;
}
