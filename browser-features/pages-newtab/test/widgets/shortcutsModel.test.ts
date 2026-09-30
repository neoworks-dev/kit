// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import {
  mergeShortcuts,
  normalizeUrl,
  type ShortcutsSettings,
} from "../../src/widgets/builtin/shortcuts-model.ts";
import {
  assertEquals,
  runTests,
  type TestCase,
} from "../../../chrome/test/utils/test_harness.ts";

const site = (host: string) => ({ url: `https://${host}/`, title: host });

function settings(patch: Partial<ShortcutsSettings>): ShortcutsSettings {
  return { pinned: [], hidden: [], showFrequent: true, limit: 8, ...patch };
}

const urls = (list: { site: { url: string } }[]) =>
  list.map((s) => new URL(s.site.url).hostname).join(",");

const tests: TestCase[] = [
  {
    name: "normalizeUrl adds https and rejects other schemes",
    fn: () => {
      assertEquals(normalizeUrl("example.com"), "https://example.com/", "bare host");
      assertEquals(normalizeUrl(" http://a.test/x "), "http://a.test/x", "http kept");
      assertEquals(normalizeUrl("localhost:3000"), "https://localhost:3000/", "host:port");
      assertEquals(normalizeUrl("javascript://alert(1)"), null, "javascript");
      assertEquals(normalizeUrl("file:///etc/passwd"), null, "file");
      assertEquals(normalizeUrl("   "), null, "blank");
    },
  },
  {
    name: "pinned come first, frequent fill up to the limit",
    fn: () => {
      const list = mergeShortcuts(
        settings({ pinned: [site("p.test")], limit: 3 }),
        [site("a.test"), site("p.test"), site("b.test"), site("c.test")],
      );
      assertEquals(urls(list), "p.test,a.test,b.test", "order and limit");
      assertEquals(list[0].pinned && !list[1].pinned, true, "pinned flags");
    },
  },
  {
    name: "hidden sites and disabled frequent sites are left out",
    fn: () => {
      const frequent = [site("a.test"), site("b.test")];
      assertEquals(
        urls(mergeShortcuts(settings({ hidden: ["https://a.test/"] }), frequent)),
        "b.test",
        "hidden",
      );
      assertEquals(
        urls(mergeShortcuts(settings({ showFrequent: false }), frequent)),
        "",
        "frequent off",
      );
    },
  },
  {
    name: "pinned sites show even past the limit",
    fn: () => {
      const list = mergeShortcuts(
        settings({ pinned: [site("a.test"), site("b.test")], limit: 1 }),
        [site("c.test")],
      );
      assertEquals(urls(list), "a.test,b.test", "all pinned");
    },
  },
];

export async function runAllTests(): Promise<void> {
  await runTests("shortcutsModel.test.ts", tests);
}
