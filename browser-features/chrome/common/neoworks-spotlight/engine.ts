// SPDX-License-Identifier: MPL-2.0

// The default search engine's name and icon, kept at hand so the spotlight
// can name it without waiting on the search service.

import { createSignal } from "solid-js";
import type { SearchEngineInfo } from "./types.ts";

interface SearchEngine {
  name: string;
  getIconURL(preferredWidth?: number): Promise<string | undefined>;
}

// `Services.search` is not exposed to feature modules; import the service directly.
const { SearchService: searchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs",
) as { SearchService: { getDefault(): Promise<SearchEngine> } };

// SearchUtils.TOPIC_ENGINE_MODIFIED; the default changing is one of its events.
const ENGINE_MODIFIED_TOPIC = "browser-search-engine-modified";

const [engine, setEngine] = createSignal<SearchEngineInfo | null>(null);

export { engine as defaultEngine };

async function refresh(): Promise<void> {
  try {
    const current = await searchService.getDefault();
    const icon = await current.getIconURL(16);
    setEngine({ name: current.name, icon: icon ?? "" });
  } catch (error) {
    console.error(
      "[neoworks-spotlight] Reading the default search engine failed:",
      error,
    );
  }
}

const observer = {
  observe(): void {
    refresh();
  },
};

// Returns a stop function for hot reload.
export function watchDefaultEngine(): () => void {
  Services.obs.addObserver(observer, ENGINE_MODIFIED_TOPIC);
  refresh();
  return () => Services.obs.removeObserver(observer, ENGINE_MODIFIED_TOPIC);
}
