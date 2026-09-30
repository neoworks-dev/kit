// SPDX-License-Identifier: MPL-2.0

// Calls into the browser through functions the NRStartPage actor exports onto
// the page (actors/NRStartPageChild.sys.mts).

import { callNRWithRetry } from "./nrRetry.ts";

declare global {
  var NRGetCurrentTopSites:
    | ((callback: (data: string) => void) => void)
    | undefined;
  var NROpenSpotlight: (() => void) | undefined;
}

export interface TopSite {
  url: string;
  title: string;
}

interface RawTopSite {
  url?: unknown;
  title?: unknown;
  label?: unknown;
}

function toTopSite(raw: RawTopSite): TopSite | null {
  if (typeof raw.url !== "string") return null;
  const title = [raw.title, raw.label].find(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return { url: raw.url, title: title ?? hostname(raw.url) };
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Firefox's frecent sites, as shown on its own new tab page.
export async function getTopSites(): Promise<TopSite[]> {
  try {
    const parsed = await callNRWithRetry<{ topsites?: RawTopSite[] }>(
      (cb) => {
        if (!globalThis.NRGetCurrentTopSites) {
          throw new Error("NRGetCurrentTopSites isn't available");
        }
        globalThis.NRGetCurrentTopSites(cb);
      },
      (data) => JSON.parse(data),
      {
        retries: 3,
        timeoutMs: 1200,
        delayMs: 300,
        shouldRetry: (res) => !res || !Array.isArray(res.topsites),
      },
    );
    return (parsed.topsites ?? [])
      .map(toTopSite)
      .filter((site): site is TopSite => site !== null);
  } catch (e) {
    console.error("[NewTab] Failed to get top sites:", e);
    return [];
  }
}

export function openSpotlight(): void {
  globalThis.NROpenSpotlight?.();
}

// Favicon from Places; only resolves on the privileged chrome:// page.
export function faviconUrl(url: string): string {
  return `page-icon:${url}`;
}
