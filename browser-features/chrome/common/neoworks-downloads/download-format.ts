// SPDX-License-Identifier: MPL-2.0

// Browser-independent download presentation, kept apart so it can be tested
// with plain objects.

import type { DownloadState, DownloadStatus } from "./types.ts";

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const BYTES_PER_UNIT = 1024;
const SEPARATOR = " · ";

// Same priority as Firefox's DownloadsCommon.stateOfDownload.
export function downloadState(download: DownloadStatus): DownloadState {
  if (!download.stopped) {
    return "downloading";
  }
  if (download.succeeded) {
    return "done";
  }
  if (download.error) {
    return "failed";
  }
  if (download.hasPartialData) {
    return "paused";
  }
  return "canceled";
}

// One decimal below 10 ("2.5 MB"), whole numbers above ("340 KB").
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unitIndex = 0;
  while (value >= BYTES_PER_UNIT && unitIndex < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  }
  const unit = BYTE_UNITS[unitIndex];
  if (unitIndex === 0 || value >= 10) {
    return `${Math.round(value)} ${unit}`;
  }
  return `${value.toFixed(1)} ${unit}`;
}

// The last path segment, for both "/" and "\" separators.
export function fileNameOf(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function transferText(download: DownloadStatus): string {
  if (download.hasProgress && download.totalBytes > 0) {
    return `${formatBytes(download.currentBytes)} of ${formatBytes(download.totalBytes)}`;
  }
  return formatBytes(download.currentBytes);
}

function joinParts(parts: string[]): string {
  return parts.filter((part) => part !== "").join(SEPARATOR);
}

function downloadingText(download: DownloadStatus): string {
  if (download.speed <= 0) {
    return transferText(download);
  }
  return joinParts([transferText(download), `${formatBytes(download.speed)}/s`]);
}

function doneText(download: DownloadStatus): string {
  if (download.target.exists === false) {
    return "File moved or missing";
  }
  const size = formatBytes(Math.max(download.totalBytes, download.currentBytes));
  return joinParts([size, hostOf(download.source.url)]);
}

function failedText(download: DownloadStatus): string {
  if (download.error?.becauseBlocked) {
    return "Blocked";
  }
  return "Failed";
}

export function statusText(download: DownloadStatus): string {
  const state = downloadState(download);
  if (state === "downloading") {
    return downloadingText(download);
  }
  if (state === "paused") {
    return joinParts(["Paused", transferText(download)]);
  }
  if (state === "done") {
    return doneText(download);
  }
  if (state === "failed") {
    return failedText(download);
  }
  return "Canceled";
}

// Bytes-weighted progress of the running downloads whose size is known, 0-100;
// null when there are none.
export function overallProgress(downloads: DownloadStatus[]): number | null {
  const measurable = downloads.filter((download) =>
    downloadState(download) === "downloading" && download.hasProgress &&
    download.totalBytes > 0
  );
  if (measurable.length === 0) {
    return null;
  }
  let currentBytes = 0;
  let totalBytes = 0;
  for (const download of measurable) {
    currentBytes += download.currentBytes;
    totalBytes += download.totalBytes;
  }
  return Math.round((currentBytes / totalBytes) * 100);
}

// Null when the total size is unknown, so no progress bar can be drawn.
export function progressPercent(download: DownloadStatus): number | null {
  if (!download.hasProgress) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(download.progress)));
}
