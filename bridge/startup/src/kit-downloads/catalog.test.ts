// SPDX-License-Identifier: MPL-2.0

// deno test bridge/startup/src/kit-downloads/catalog.test.ts

/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert";
import {
  dayLabel,
  describeDownload,
  formatBytes,
  kindOf,
  summarize,
} from "./catalog.ts";

Deno.test("kinds come from the extension, any case", () => {
  assertEquals(kindOf("Report.PDF"), "document");
  assertEquals(kindOf("photo.heic"), "image");
  assertEquals(kindOf("backup.tar.gz"), "archive");
  assertEquals(kindOf("Makefile"), "other");
  assertEquals(kindOf(".bashrc"), "other");
});

Deno.test("a download without a path is named after its URL", () => {
  const info = describeDownload({
    source: { url: "https://example.com/files/My%20Notes.txt" },
    target: {},
  });
  assertEquals(info.name, "My Notes.txt");
  assertEquals(info.kind, "document");
});

Deno.test("failed means an error or a cancel, never a finished one", () => {
  assertEquals(
    describeDownload({ target: { path: "/a.zip" }, error: {} }).failed,
    true,
  );
  assertEquals(
    describeDownload({ target: { path: "/a.zip" }, canceled: true }).failed,
    true,
  );
  assertEquals(
    describeDownload({ target: { path: "/a.zip" }, succeeded: true }).failed,
    false,
  );
});

Deno.test("sizes read like Finder's", () => {
  assertEquals(formatBytes(1), "1 byte");
  assertEquals(formatBytes(577), "577 bytes");
  assertEquals(formatBytes(13_000), "13 KB");
  assertEquals(formatBytes(2_400_000), "2.4 MB");
});

Deno.test("days are relative within a week", () => {
  const now = new Date(2026, 9, 31, 17, 0).getTime();
  assertEquals(dayLabel(new Date(2026, 9, 31, 1, 0).getTime(), now), "Today");
  assertEquals(
    dayLabel(new Date(2026, 9, 30, 23, 0).getTime(), now),
    "Yesterday",
  );
  assertEquals(
    dayLabel(new Date(2026, 9, 27, 12, 0).getTime(), now),
    "Tuesday",
  );
  assertEquals(
    dayLabel(new Date(2026, 8, 3, 12, 0).getTime(), now),
    "September 3",
  );
  assertEquals(
    dayLabel(new Date(2025, 8, 3, 12, 0).getTime(), now),
    "September 3, 2025",
  );
});

Deno.test("the summary adds up per kind", () => {
  const summary = summarize([
    { name: "a.pdf", kind: "document", failed: false, size: 100, time: 0 },
    { name: "b.pdf", kind: "document", failed: false, size: 50, time: 0 },
    { name: "c.zip", kind: "archive", failed: true, size: 0, time: 0 },
  ]);
  assertEquals(summary.count, 3);
  assertEquals(summary.bytes, 150);
  assertEquals(summary.failed, 1);
  assertEquals(summary.byKind.document, { count: 2, bytes: 150 });
});
