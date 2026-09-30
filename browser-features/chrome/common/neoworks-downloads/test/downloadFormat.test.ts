// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assertEquals,
  runTests,
  type TestCase,
} from "../../../test/utils/test_harness.ts";
import {
  downloadState,
  fileNameOf,
  formatBytes,
  overallProgress,
  progressPercent,
  statusText,
} from "../download-format.ts";
import type { DownloadStatus } from "../types.ts";

const MEGABYTE = 1024 * 1024;

function download(overrides: Partial<DownloadStatus>): DownloadStatus {
  return {
    stopped: false,
    succeeded: false,
    error: null,
    hasPartialData: false,
    hasProgress: true,
    progress: 25,
    currentBytes: 10 * MEGABYTE,
    totalBytes: 40 * MEGABYTE,
    speed: 2 * MEGABYTE,
    source: { url: "https://example.com/report.pdf" },
    target: { path: "/home/user/Downloads/report.pdf" },
    ...overrides,
  };
}

function testStates(): void {
  assertEquals(downloadState(download({})), "downloading", "running");
  assertEquals(
    downloadState(download({ stopped: true, succeeded: true })),
    "done",
    "succeeded",
  );
  assertEquals(
    downloadState(download({ stopped: true, error: {} })),
    "failed",
    "error",
  );
  assertEquals(
    downloadState(download({ stopped: true, hasPartialData: true })),
    "paused",
    "stopped with partial data",
  );
  assertEquals(downloadState(download({ stopped: true })), "canceled", "stopped");
}

function testFormatBytes(): void {
  assertEquals(formatBytes(512), "512 B", "bytes");
  assertEquals(formatBytes(1536), "1.5 KB", "one decimal below 10");
  assertEquals(formatBytes(340 * 1024), "340 KB", "whole number above 10");
  assertEquals(formatBytes(40 * MEGABYTE), "40 MB", "megabytes");
}

function testFileName(): void {
  assertEquals(fileNameOf("/home/user/Downloads/a.zip"), "a.zip", "unix path");
  assertEquals(fileNameOf("C:\\Users\\me\\a.zip"), "a.zip", "windows path");
}

function testStatusText(): void {
  assertEquals(statusText(download({})), "10 MB of 40 MB · 2.0 MB/s", "downloading");
  assertEquals(
    statusText(download({ stopped: true, hasPartialData: true })),
    "Paused · 10 MB of 40 MB",
    "paused",
  );
  assertEquals(
    statusText(download({ stopped: true, succeeded: true, currentBytes: 40 * MEGABYTE })),
    "40 MB · example.com",
    "done shows size and host",
  );
  assertEquals(
    statusText(download({ stopped: true, succeeded: true, target: { path: "/x", exists: false } })),
    "File moved or missing",
    "missing file",
  );
  assertEquals(
    statusText(download({ stopped: true, error: { becauseBlocked: true } })),
    "Blocked",
    "blocked",
  );
}

function testProgress(): void {
  assertEquals(progressPercent(download({})), 25, "known size");
  assertEquals(progressPercent(download({ hasProgress: false })), null, "unknown size");
  const running = [
    download({ currentBytes: 10 * MEGABYTE, totalBytes: 40 * MEGABYTE }),
    download({ currentBytes: 30 * MEGABYTE, totalBytes: 40 * MEGABYTE }),
    download({ stopped: true, succeeded: true }),
  ];
  assertEquals(overallProgress(running), 50, "bytes-weighted over running downloads");
  assertEquals(overallProgress([download({ stopped: true })]), null, "nothing running");
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [
    { name: "download states", fn: testStates },
    { name: "formatBytes", fn: testFormatBytes },
    { name: "fileNameOf", fn: testFileName },
    { name: "statusText", fn: testStatusText },
    { name: "progress", fn: testProgress },
  ];
  await runTests("downloadFormat.test.ts", tests);
}
