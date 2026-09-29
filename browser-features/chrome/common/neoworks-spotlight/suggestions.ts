// SPDX-License-Identifier: MPL-2.0

// Remote search suggestions from the default engine, through Firefox's own
// controller so the search suggestion prefs and private browsing rules apply.

import type { SpotlightResult } from "./types.ts";

const MAX_SUGGESTIONS = 4;

interface SearchEngine {
  name: string;
  getSubmission(term: string): { uri: { spec: string } };
}

interface SuggestionFetchResult {
  remote: { value: string }[];
}

interface SuggestionController {
  fetch(options: {
    searchString: string;
    inPrivateBrowsing: boolean;
    engine: SearchEngine;
    maxLocalResults: number;
    maxRemoteResults: number;
    userContextId: number;
  }): Promise<SuggestionFetchResult | null>;
  stop(): void;
}

const { SearchSuggestionController } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchSuggestionController.sys.mjs",
) as {
  SearchSuggestionController: {
    new (): SuggestionController;
    engineOffersSuggestions(engine: SearchEngine): boolean;
  };
};

const browserWindow = window as unknown as {
  PrivateBrowsingUtils: { isWindowPrivate(window: Window): boolean };
};

// `Services.search` is not exposed to feature modules; import the service directly.
const { SearchService: searchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs",
) as { SearchService: { getDefault(): Promise<SearchEngine> } };

// One controller per window: `fetch` cancels the previous in-flight request.
const controller = new SearchSuggestionController();

function toResult(engine: SearchEngine, term: string): SpotlightResult {
  return {
    kind: "suggestion",
    title: term,
    subtitle: "Search with " + engine.name,
    url: engine.getSubmission(term).uri.spec,
  };
}

function uniqueSuggestions(query: string, terms: string[]): string[] {
  const typed = query.trim().toLowerCase();
  const seen = new Set<string>();
  return terms.filter((term) => {
    const normalized = term.trim().toLowerCase();
    if (!normalized || normalized === typed || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

export async function suggestionResults(
  query: string,
  userContextId: number,
): Promise<SpotlightResult[]> {
  const engine = await searchService.getDefault();
  if (!SearchSuggestionController.engineOffersSuggestions(engine)) {
    return [];
  }
  const fetched = await controller.fetch({
    searchString: query,
    inPrivateBrowsing: browserWindow.PrivateBrowsingUtils.isWindowPrivate(window),
    engine,
    maxLocalResults: 0,
    maxRemoteResults: MAX_SUGGESTIONS + 1,
    userContextId,
  });
  if (!fetched) {
    return [];
  }
  const terms = uniqueSuggestions(query, fetched.remote.map((entry) => entry.value));
  return terms.slice(0, MAX_SUGGESTIONS).map((term) => toResult(engine, term));
}

export function stopSuggestions(): void {
  controller.stop();
}
