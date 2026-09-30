// SPDX-License-Identifier: MPL-2.0

import type { TopSite } from "../../lib/browser.ts";

export type ShortcutsSettings = {
  pinned: TopSite[];
  // Frequent sites the user removed; never shown again.
  hidden: string[];
  showFrequent: boolean;
  limit: number;
};

// Accepts "example.com" as well as full http(s) URLs.
export function normalizeUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`,
    );
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// Pinned sites first, then frequent ones that aren't pinned or hidden, up to
// the limit. Pinned sites always show, even past the limit.
export function mergeShortcuts(
  settings: ShortcutsSettings,
  frequent: readonly TopSite[],
): { site: TopSite; pinned: boolean }[] {
  const seen = new Set(settings.pinned.map((s) => s.url));
  const hidden = new Set(settings.hidden);
  const list = settings.pinned.map((site) => ({ site, pinned: true }));
  if (settings.showFrequent) {
    for (const site of frequent) {
      if (list.length >= settings.limit) break;
      if (!seen.has(site.url) && !hidden.has(site.url)) {
        seen.add(site.url);
        list.push({ site, pinned: false });
      }
    }
  }
  return list;
}
