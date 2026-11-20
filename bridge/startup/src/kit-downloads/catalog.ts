// SPDX-License-Identifier: MPL-2.0

// What the downloads page says about a download: its kind, its day, its
// size. No DOM, so it can be tested on its own.

import type {
  DownloadFilter,
  DownloadInfo,
  DownloadKind,
  DownloadSummary,
  FirefoxDownload,
} from "./types.ts";

const EXTENSION_KINDS: Record<Exclude<DownloadKind, "other">, string[]> = {
  document: [
    "pdf",
    "doc",
    "docx",
    "odt",
    "rtf",
    "txt",
    "md",
    "xls",
    "xlsx",
    "ods",
    "csv",
    "ppt",
    "pptx",
    "odp",
    "epub",
    "pages",
    "numbers",
    "key",
  ],
  image: [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "avif",
    "svg",
    "heic",
    "bmp",
    "tif",
    "tiff",
    "ico",
  ],
  media: [
    "mp4",
    "mkv",
    "webm",
    "mov",
    "avi",
    "m4v",
    "mp3",
    "wav",
    "flac",
    "ogg",
    "oga",
    "m4a",
    "opus",
    "aac",
  ],
  archive: [
    "zip",
    "tar",
    "gz",
    "tgz",
    "bz2",
    "xz",
    "zst",
    "7z",
    "rar",
    "dmg",
    "iso",
  ],
};

const KIND_BY_EXTENSION = new Map<string, DownloadKind>(
  Object.entries(EXTENSION_KINDS).flatMap(([kind, extensions]) =>
    extensions.map((extension) => [extension, kind as DownloadKind] as const)
  ),
);

export const KIND_LABELS: Record<DownloadKind, string> = {
  document: "Documents",
  image: "Images",
  media: "Audio & video",
  archive: "Archives",
  other: "Other",
};

export const KINDS: DownloadKind[] = [
  "document",
  "image",
  "media",
  "archive",
  "other",
];

export function kindOf(name: string): DownloadKind {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return "other";
  }
  return KIND_BY_EXTENSION.get(name.slice(dot + 1).toLowerCase()) ?? "other";
}

function fileName(download: FirefoxDownload): string {
  const path = download.target.path;
  if (path) {
    return path.split(/[\\/]/).pop() ?? path;
  }
  const url = download.source?.url ?? "";
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (last) {
      return decodeURIComponent(last);
    }
  } catch {
    // Not a URL; fall through to the generic name.
  }
  return "Download";
}

function timeOf(download: FirefoxDownload): number {
  if (download.endTime) {
    return download.endTime;
  }
  const start = download.startTime;
  if (start instanceof Date) {
    return start.getTime();
  }
  return start ?? 0;
}

export function describeDownload(download: FirefoxDownload): DownloadInfo {
  const name = fileName(download);
  return {
    name,
    kind: kindOf(name),
    failed: !download.succeeded && (!!download.error || !!download.canceled),
    size: download.target.size ??
      (download.succeeded ? download.totalBytes ?? 0 : 0),
    time: timeOf(download),
  };
}

export function matchesFilter(
  info: DownloadInfo,
  filter: DownloadFilter,
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "failed") {
    return info.failed;
  }
  return info.kind === filter;
}

export function summarize(infos: DownloadInfo[]): DownloadSummary {
  const byKind = Object.fromEntries(
    KINDS.map((kind) => [kind, { count: 0, bytes: 0 }]),
  ) as DownloadSummary["byKind"];
  let bytes = 0;
  let failed = 0;
  for (const info of infos) {
    byKind[info.kind].count += 1;
    byKind[info.kind].bytes += info.size;
    bytes += info.size;
    if (info.failed) {
      failed += 1;
    }
  }
  return { count: infos.length, bytes, failed, byKind };
}

const UNITS = ["bytes", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  if (unit === 0) {
    return `${value} ${value === 1 ? "byte" : "bytes"}`;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

// "Today", "Yesterday", a weekday within the last week, then a date.
export function dayLabel(time: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY_MS);
  if (days <= 0) {
    return "Today";
  }
  if (days === 1) {
    return "Yesterday";
  }
  const date = new Date(time);
  if (days < 7) {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}
