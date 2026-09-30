// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import { PHOTOS } from "../../src/background/photos.ts";
import {
  localDay,
  photoForDay,
  photoUrl,
  photoWidth,
  randomPhoto,
  unsplashLink,
} from "../../src/background/pick.ts";
import {
  assert,
  assertEquals,
  runTests,
  type TestCase,
} from "../../../chrome/test/utils/test_harness.ts";

const tests: TestCase[] = [
  {
    name: "the photo only changes between days",
    fn: () => {
      const morning = localDay(new Date(2026, 8, 30, 0, 5));
      const night = localDay(new Date(2026, 8, 30, 23, 55));
      const next = localDay(new Date(2026, 9, 1, 0, 5));
      assertEquals(morning, night, "same local day");
      assertEquals(next, morning + 1, "next local day");
    },
  },
  {
    name: "a cycle of days shows every photo once",
    fn: () => {
      const start = 20_000;
      const seen = new Set(
        PHOTOS.map((_, i) => photoForDay(PHOTOS, start + i)),
      );
      assertEquals(seen.size, PHOTOS.length, "every photo in one cycle");
      assert(
        photoForDay(PHOTOS, start) !== photoForDay(PHOTOS, start + 1),
        "consecutive days differ",
      );
    },
  },
  {
    name: "a shuffled photo differs from the previous one",
    fn: () => {
      const list = ["a", "b", "c"];
      for (const r of [0, 0.5, 0.99]) {
        assert(randomPhoto(list, "a", () => r) !== "a", `random ${r}`);
      }
      assertEquals(randomPhoto(["only"], "only"), "only", "single photo");
    },
  },
  {
    name: "photo width rounds up to a shared size",
    fn: () => {
      assertEquals(photoWidth(1280, 1), 1280, "exact");
      assertEquals(photoWidth(1440, 1), 1920, "rounds up");
      assertEquals(photoWidth(1920, 2), 2560, "capped");
    },
  },
  {
    name: "URLs point at the images CDN and credit Unsplash",
    fn: () => {
      assertEquals(
        photoUrl({ id: "1-a", photographer: "X", page: "" }, 1920),
        "https://images.unsplash.com/photo-1-a?auto=format&fit=crop&w=1920&q=80",
        "image URL",
      );
      assertEquals(
        unsplashLink("https://unsplash.com/photos/abc"),
        "https://unsplash.com/photos/abc?utm_source=kit&utm_medium=referral",
        "referral link",
      );
    },
  },
];

export async function runAllTests(): Promise<void> {
  await runTests("pick.test.ts", tests);
}
