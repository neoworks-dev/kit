// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  assertEquals,
  runTests,
  type TestCase,
} from "../../../chrome/test/utils/test_harness.ts";
import { sessionTabIcon, zenSpaceIcon } from "../NWBrowserImportGecko.ts";

const tests: TestCase[] = [
  {
    name: "zenSpaceIcon keeps emoji and extracts icon names",
    fn: () => {
      assertEquals(zenSpaceIcon("🚀"), "🚀", "zenSpaceIcon(🚀), 🚀");
      assertEquals(zenSpaceIcon("chrome://browser/skin/zen-icons/selectable/book.svg"), "book", "zenSpaceIcon(chrome://browser/skin/zen-icons/selec");
      assertEquals(zenSpaceIcon("https://example.com/"), "", "zenSpaceIcon(https://example.com/), ");
      assertEquals(zenSpaceIcon(undefined), "", "zenSpaceIcon(undefined), ");
    },
  },
  {
    name: "sessionTabIcon accepts only data image URIs",
    fn: () => {
      assertEquals(sessionTabIcon("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA", "sessionTabIcon(data:image/png;base64,AAAA), data:i");
      assertEquals(sessionTabIcon("chrome://global/skin/icons/defaultFavicon.svg"), "", "sessionTabIcon(chrome://global/skin/icons/defaultF");
      assertEquals(sessionTabIcon(undefined), "", "sessionTabIcon(undefined), ");
    },
  },
];

export async function runAllTests(): Promise<void> {
  await runTests("NWBrowserImportGecko.test.ts", tests);
}
