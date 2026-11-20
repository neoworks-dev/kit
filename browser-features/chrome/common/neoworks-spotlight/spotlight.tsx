// SPDX-License-Identifier: MPL-2.0

import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { createPageBackdrop } from "../neoworks-ui/page-backdrop.ts";
import { jumpToQuickmark } from "../neoworks-commands/quickmarks.ts";
import { runCommand } from "../neoworks-commands/registry.ts";
import { selectTab } from "../neoworks-sidebar/tab-actions.ts";
import {
  archivedTabs,
  reopenArchivedTab,
} from "../neoworks-sidebar/tab-archive.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import { switchWorkspace } from "../neoworks-sidebar/workspaces.ts";
import { bangIndex, loadBangs, parseBangQuery } from "./bangs.ts";
import { defaultEngine } from "./engine.ts";
import { displayUrl, inlineCompletion } from "./history-rank.ts";
import { historyResults, rememberPick, resultUrl } from "./places.ts";
import {
  archivedMatches,
  bangResults,
  isSearchQuery,
  localResults,
  navigateResult,
  openTabResult,
  openTabUrls,
} from "./search.ts";
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
// What the input shows, completion included; the ghost hint lines up after it.
const [inputText, setInputText] = createSignal("");
const [hint, setHint] = createSignal("");

// solid-xul has no `use` helper, so refs don't compile; look elements up by id.
const INPUT_ID = "neoworks-spotlight-input";
const RESULTS_ID = "neoworks-spotlight-results";
const PANEL_ID = "neoworks-spotlight-panel";
const BACKDROP_ID = "neoworks-spotlight-backdrop";

const MAX_PLACES_RESULTS = 6;
// How long Enter waits for the top hit when typed faster than history answers.
const TOP_HIT_WAIT_MS = 250;

interface AsyncResults {
  topHit: SpotlightResult | null;
  suggestions: SpotlightResult[];
  places: SpotlightResult[];
}

const NO_ASYNC_RESULTS: AsyncResults = {
  topHit: null,
  suggestions: [],
  places: [],
};

// Drops async responses that arrive after a newer keystroke.
let searchGeneration = 0;
let asyncResults = NO_ASYNC_RESULTS;
let pendingHistory: Promise<void> | null = null;
// Exactly what was typed, without the inline completion.
let typedText = "";
// Deleting text must not bring the completion straight back, so the top hit
// waits for the next typed character.
let completionAllowed = true;
let completion = "";

function inputElement(): HTMLInputElement | null {
  return document.getElementById(INPUT_ID) as HTMLInputElement | null;
}

export function openSpotlight(): void {
  if (isOpen()) {
    return;
  }
  setIsOpen(true);
  completionAllowed = true;
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

// Result order: the top hit, the open/search row, matching
// tabs/quickmarks/commands, history and bookmarks, archived tabs, then engine
// suggestions. A bang shows only its own rows.
function showResults(query: string): void {
  const bangs = bangResults(query);
  if (bangs.length > 0) {
    setResults(bangs);
    syncInput();
    return;
  }
  const { topHit } = asyncResults;
  const topUrl = topHit ? resultUrl(topHit) : "";
  const notTopHit = (result: SpotlightResult) =>
    !topUrl || resultUrl(result) !== topUrl;
  setResults([
    ...(topHit ? [topHit] : []),
    ...navigateResults(query).filter(notTopHit),
    ...localResults(query).filter(notTopHit),
    ...asyncResults.places.filter(notTopHit),
    ...archivedMatches(query).filter(notTopHit),
    ...asyncResults.suggestions,
  ]);
  syncInput();
}

function highlightedResult(): SpotlightResult | undefined {
  return results()[highlightIndex()];
}

// Where Enter goes, for rows whose URL isn't already in the input.
function hintFor(result: SpotlightResult | undefined): string {
  // Over an empty input the hint would run into the placeholder.
  if (!result || completion || !typedText.trim()) {
    return "";
  }
  if (result.kind === "bang") {
    return "";
  }
  if (result.kind === "navigate" && isSearchQuery(result)) {
    return "";
  }
  if (result.kind === "suggestion") {
    return "";
  }
  const url = resultUrl(result);
  if (!url || displayUrl(url) === typedText.trim()) {
    return "";
  }
  return displayUrl(url);
}

// Completes the input inline when the highlighted top hit's URL starts with
// what was typed, with the completed part selected so typing replaces it.
// Leaves the input alone once the user moved the caret into a completion.
function syncInput(): void {
  const input = inputElement();
  if (!input) {
    return;
  }
  const untouched = input.value === typedText + completion &&
    (!completion ||
      (input.selectionStart === typedText.length &&
        input.selectionEnd === input.value.length));
  if (untouched) {
    const result = highlightedResult();
    completion = "";
    if (completionAllowed && result?.topHit) {
      completion = inlineCompletion(typedText, resultUrl(result));
    }
    input.value = typedText + completion;
    if (completion) {
      input.setSelectionRange(typedText.length, input.value.length);
    }
  }
  setInputText(input.value);
  setHint(hintFor(highlightedResult()));
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

// A top hit that is already open becomes a switch-to-tab row.
function topHitRow(topHit: SpotlightResult | null): SpotlightResult | null {
  if (!topHit) {
    return null;
  }
  const tab = openTabResult(resultUrl(topHit));
  if (!tab) {
    return topHit;
  }
  return { ...tab, topHit: true };
}

async function requestHistory(
  query: string,
  generation: number,
): Promise<void> {
  const history = await historyResults(query, completionAllowed);
  if (generation !== searchGeneration) {
    return;
  }
  // Open and archived tabs already have their own rows.
  const excluded = new Set([
    ...openTabUrls(),
    ...archivedTabs().map((tab) => tab.url),
  ]);
  const places = history.places
    .filter((result) => !excluded.has(resultUrl(result)))
    .slice(0, MAX_PLACES_RESULTS);
  asyncResults = { ...asyncResults, topHit: topHitRow(history.topHit), places };
  showResults(query);
}

async function requestSuggestions(
  query: string,
  generation: number,
): Promise<void> {
  const userContextId = tabbrowser().selectedTab.userContextId;
  const suggestions = await suggestionResults(query, userContextId);
  if (generation !== searchGeneration) {
    return;
  }
  asyncResults = { ...asyncResults, suggestions };
  showResults(query);
}

function logFailure(source: string): (error: unknown) => void {
  return (error) =>
    console.error(`[neoworks-spotlight] ${source} failed:`, error);
}

function updateResults(rawQuery: string): void {
  searchGeneration += 1;
  const generation = searchGeneration;
  const query = rawQuery.trim();
  typedText = rawQuery;
  completion = "";
  asyncResults = NO_ASYNC_RESULTS;
  pendingHistory = null;
  setHighlightIndex(0);
  showResults(query);
  if (!query) {
    stopSuggestions();
    return;
  }
  // A "!" token may be a bang: never send it to the engine for suggestions.
  if (parseBangQuery(query)) {
    stopSuggestions();
    if (!bangIndex()) {
      loadBangs()
        .then(() => {
          if (generation === searchGeneration) {
            showResults(query);
          }
        })
        .catch(logFailure("Loading bangs"));
    }
    return;
  }
  const history = requestHistory(query, generation).catch(
    logFailure("History search"),
  );
  pendingHistory = history;
  history.finally(() => {
    if (pendingHistory === history) {
      pendingHistory = null;
    }
  });
  if (isSearchQuery(navigateResult(query))) {
    requestSuggestions(query, generation).catch(
      logFailure("Search suggestions"),
    );
  }
}

// Searches and commands aren't pages, so they teach the top hit nothing.
function rememberable(result: SpotlightResult): boolean {
  if (result.kind === "suggestion" || result.kind === "bang") {
    return false;
  }
  return result.kind !== "navigate" || !isSearchQuery(result);
}

function runResult(result: SpotlightResult | undefined): void {
  if (!result) {
    return;
  }
  if (rememberable(result)) {
    rememberPick(typedText.trim(), resultUrl(result));
  }
  closeSpotlight();
  switch (result.kind) {
    case "tab":
      return selectTab(result.tab);
    case "archived":
      return reopenArchivedTab(result.archived);
    case "command":
      return runCommand({ command: result.command });
    case "quickmark":
      return jumpToQuickmark(result.quickmark);
    case "workspace":
      return switchWorkspace(result.workspace.id);
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
  syncInput();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Typing and pressing Enter quickly shouldn't search when the top hit is a
// moment away, so Enter on the first row waits briefly for history.
async function runHighlighted(): Promise<void> {
  const generation = searchGeneration;
  // Enter right after typing "!yt cats" shouldn't search for "!yt cats".
  if (parseBangQuery(typedText) && !bangIndex()) {
    try {
      await loadBangs();
    } catch (error) {
      logFailure("Loading bangs")(error);
    }
    if (generation !== searchGeneration || !isOpen()) {
      return;
    }
    showResults(typedText.trim());
  }
  if (highlightIndex() === 0 && pendingHistory) {
    await Promise.race([pendingHistory, delay(TOP_HIT_WAIT_MS)]);
    if (generation !== searchGeneration || !isOpen()) {
      return;
    }
  }
  runResult(highlightedResult());
}

function handleInput(event: InputEvent): void {
  completionAllowed = !event.inputType.startsWith("delete");
  updateResults((event.currentTarget as HTMLInputElement).value);
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
    runHighlighted();
    return;
  }
  if (event.key === "Tab" && !event.shiftKey && completeBang()) {
    event.preventDefault();
  }
}

// Tab on a bang row takes its trigger into the input, ready for the terms.
function completeBang(): boolean {
  const result = highlightedResult();
  const input = inputElement();
  if (result?.kind !== "bang" || result.terms || !input) {
    return false;
  }
  input.value = "!" + result.trigger + " ";
  completionAllowed = true;
  updateResults(input.value);
  return true;
}

function placeholder(): string {
  const engine = defaultEngine();
  if (!engine) {
    return "Search tabs, enter address, or run a command";
  }
  return `Search ${engine.name}, tabs and commands, or type !bang`;
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
        onHover={() => {
          setHighlightIndex(props.index);
          syncInput();
        }}
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
          <div class="nw-spotlight-field">
            <input
              id={INPUT_ID}
              class="nw-spotlight-input"
              placeholder={placeholder()}
              spellcheck={false}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onBlur={closeSpotlight}
            />
            <Show when={hint()}>
              <div class="nw-spotlight-ghost">
                <span class="nw-spotlight-ghost-text">{inputText()}</span>
                <span class="nw-spotlight-hint">{"  →  " + hint()}</span>
              </div>
            </Show>
          </div>
        </div>
        <Show when={results().length > 0}>
          <div id={RESULTS_ID} class="nw-spotlight-results">
            <For each={results()}>
              {(result, index) => (
                <ResultListItem result={result} index={index()} />
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
