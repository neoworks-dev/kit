// SPDX-License-Identifier: MPL-2.0

import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { createPageBackdrop } from "../neoworks-ui/page-backdrop.ts";
import { jumpToQuickmark } from "../neoworks-commands/quickmarks.ts";
import { runCommand } from "../neoworks-commands/registry.ts";
import { selectTab } from "../neoworks-sidebar/tab-actions.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import { placesResults } from "./places.ts";
import { isSearchQuery, localResults, navigateResult, openTabUrls } from "./search.ts";
import { stopSuggestions, suggestionResults } from "./suggestions.ts";
import { ResultRow, sectionTitle, startsSection } from "./result-row.tsx";
import type { SpotlightResult } from "./types.ts";
import glassStyle from "../neoworks-ui/glass.css?inline";
import iconStyle from "../neoworks-ui/icons.css?inline";
import spotlightStyle from "./spotlight.css?inline";

const browserWindow = window as unknown as {
  openTrustedLinkIn(url: string, where: string): void;
};

const [isOpen, setIsOpen] = createSignal(false);
const [results, setResults] = createSignal<SpotlightResult[]>([]);
const [highlightIndex, setHighlightIndex] = createSignal(0);

// solid-xul has no `use` helper, so refs don't compile; look elements up by id.
const INPUT_ID = "neoworks-spotlight-input";
const RESULTS_ID = "neoworks-spotlight-results";
const PANEL_ID = "neoworks-spotlight-panel";
const BACKDROP_ID = "neoworks-spotlight-backdrop";

interface AsyncResults {
  suggestions: SpotlightResult[];
  places: SpotlightResult[];
}

// Drops async responses that arrive after a newer keystroke.
let searchGeneration = 0;
let asyncResults: AsyncResults = { suggestions: [], places: [] };

function inputElement(): HTMLInputElement | null {
  return document.getElementById(INPUT_ID) as HTMLInputElement | null;
}

export function openSpotlight(): void {
  if (isOpen()) {
    return;
  }
  setIsOpen(true);
  updateResults("");
  const input = inputElement();
  if (input) {
    input.value = "";
    input.focus();
  }
}

export function closeSpotlight(): void {
  if (!isOpen()) {
    return;
  }
  searchGeneration += 1;
  stopSuggestions();
  setIsOpen(false);
  tabbrowser().selectedBrowser.focus();
}

// Result order: the open/search row, engine suggestions, matching
// tabs/quickmarks/commands, then history and bookmarks.
function showResults(query: string): void {
  setResults([
    ...navigateResults(query),
    ...asyncResults.suggestions,
    ...localResults(query),
    ...asyncResults.places,
  ]);
}

function navigateResults(query: string): SpotlightResult[] {
  if (!query) {
    return [];
  }
  const navigate = navigateResult(query);
  if (!navigate) {
    return [];
  }
  return [navigate];
}

async function requestPlaces(query: string, generation: number): Promise<void> {
  const places = await placesResults(query, openTabUrls());
  if (generation !== searchGeneration) {
    return;
  }
  asyncResults = { ...asyncResults, places };
  showResults(query);
}

async function requestSuggestions(query: string, generation: number): Promise<void> {
  const userContextId = tabbrowser().selectedTab.userContextId;
  const suggestions = await suggestionResults(query, userContextId);
  if (generation !== searchGeneration) {
    return;
  }
  asyncResults = { ...asyncResults, suggestions };
  showResults(query);
}

function logFailure(source: string): (error: unknown) => void {
  return (error) => console.error(`[neoworks-spotlight] ${source} failed:`, error);
}

function updateResults(rawQuery: string): void {
  searchGeneration += 1;
  const generation = searchGeneration;
  const query = rawQuery.trim();
  asyncResults = { suggestions: [], places: [] };
  setHighlightIndex(0);
  showResults(query);
  if (!query) {
    stopSuggestions();
    return;
  }
  requestPlaces(query, generation).catch(logFailure("History search"));
  if (isSearchQuery(navigateResult(query))) {
    requestSuggestions(query, generation).catch(logFailure("Search suggestions"));
  }
}

function runResult(result: SpotlightResult | undefined): void {
  if (!result) {
    return;
  }
  closeSpotlight();
  switch (result.kind) {
    case "tab":
      return selectTab(result.tab);
    case "command":
      return runCommand({ command: result.command });
    case "quickmark":
      return jumpToQuickmark(result.quickmark);
    default:
      return browserWindow.openTrustedLinkIn(result.url, "tab");
  }
}

function scrollHighlightIntoView(): void {
  const highlighted = document
    .getElementById(RESULTS_ID)
    ?.querySelector(".nw-spotlight-result[data-highlighted]");
  highlighted?.scrollIntoView({ block: "nearest" });
}

function moveHighlight(step: number): void {
  const count = results().length;
  if (count === 0) {
    return;
  }
  setHighlightIndex((index) => (index + step + count) % count);
  scrollHighlightIntoView();
}

function highlightStep(event: KeyboardEvent): number {
  if (event.key === "ArrowDown" || (event.ctrlKey && event.key === "n")) {
    return 1;
  }
  if (event.key === "ArrowUp" || (event.ctrlKey && event.key === "p")) {
    return -1;
  }
  return 0;
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    closeSpotlight();
    return;
  }
  const step = highlightStep(event);
  if (step !== 0) {
    event.preventDefault();
    moveHighlight(step);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    runResult(results()[highlightIndex()]);
  }
}

function attributeFlag(enabled: boolean): string | undefined {
  if (enabled) {
    return "true";
  }
  return undefined;
}

function ResultListItem(props: { result: SpotlightResult; index: number }) {
  return (
    <>
      <Show when={startsSection(results(), props.index)}>
        <div class="nw-spotlight-section">{sectionTitle(props.result)}</div>
      </Show>
      <ResultRow
        result={props.result}
        highlighted={props.index === highlightIndex()}
        onHover={() => setHighlightIndex(props.index)}
        onRun={() => runResult(props.result)}
      />
    </>
  );
}

export function Spotlight() {
  const backdrop = createPageBackdrop(PANEL_ID, BACKDROP_ID);
  createEffect(() => {
    if (isOpen()) {
      backdrop.start();
      return;
    }
    backdrop.stop();
  });
  onCleanup(() => backdrop.stop());

  return (
    <div
      id="neoworks-spotlight"
      data-open={attributeFlag(isOpen())}
      onMouseDown={(event: MouseEvent) => {
        if (event.target === event.currentTarget) {
          closeSpotlight();
        }
      }}
    >
      <style>{glassStyle + iconStyle + spotlightStyle}</style>
      <div id={PANEL_ID} class="nw-spotlight-panel nw-glass">
        <canvas id={BACKDROP_ID} class="nw-glass-backdrop" />
        <div class="nw-spotlight-search">
          <span class="nw-icon" data-icon="magnifying-glass" />
          <input
            id={INPUT_ID}
            class="nw-spotlight-input"
            placeholder="Search tabs, enter address, or run a command"
            spellcheck={false}
            onInput={(event: InputEvent) =>
              updateResults((event.currentTarget as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            onBlur={closeSpotlight}
          />
        </div>
        <Show when={results().length > 0}>
          <div id={RESULTS_ID} class="nw-spotlight-results">
            <For each={results()}>
              {(result, index) => <ResultListItem result={result} index={index()} />}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
