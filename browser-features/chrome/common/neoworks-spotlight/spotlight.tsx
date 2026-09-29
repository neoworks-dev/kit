// SPDX-License-Identifier: MPL-2.0

import { createSignal, For, Show } from "solid-js";
import { selectTab } from "../neoworks-sidebar/tab-actions.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import { navigateResult, placesResults, tabResults } from "./search.ts";
import type { SpotlightResult, SpotlightResultKind } from "./types.ts";
import spotlightStyle from "./spotlight.css?inline";

const KIND_LABELS: Record<SpotlightResultKind, string> = {
  navigate: "↵",
  tab: "Tab",
  bookmark: "★",
  history: "History",
};

const browserWindow = window as unknown as {
  openTrustedLinkIn(url: string, where: string): void;
};

const [isOpen, setIsOpen] = createSignal(false);
const [results, setResults] = createSignal<SpotlightResult[]>([]);
const [highlightIndex, setHighlightIndex] = createSignal(0);

// solid-xul has no `use` helper, so refs don't compile; look the input up by id.
const INPUT_ID = "neoworks-spotlight-input";

// Drops Places responses that arrive after a newer keystroke.
let searchGeneration = 0;

export function openSpotlight(): void {
  if (isOpen()) {
    return;
  }
  setResults([]);
  setHighlightIndex(0);
  setIsOpen(true);
  const inputElement = document.getElementById(INPUT_ID) as HTMLInputElement | null;
  if (inputElement) {
    inputElement.value = "";
    inputElement.focus();
  }
}

export function closeSpotlight(): void {
  if (!isOpen()) {
    return;
  }
  setIsOpen(false);
  tabbrowser().selectedBrowser.focus();
}

function immediateResults(query: string): SpotlightResult[] {
  const combined: SpotlightResult[] = [];
  const navigate = navigateResult(query);
  if (navigate) {
    combined.push(navigate);
  }
  return combined.concat(tabResults(query));
}

async function updateResults(query: string): Promise<void> {
  searchGeneration += 1;
  const generation = searchGeneration;
  setHighlightIndex(0);
  if (!query.trim()) {
    setResults([]);
    return;
  }
  const immediate = immediateResults(query);
  setResults(immediate);

  const places = await placesResults(query);
  if (generation !== searchGeneration) {
    return;
  }
  setResults(immediate.concat(places));
}

function runResult(result: SpotlightResult | undefined): void {
  if (!result) {
    return;
  }
  closeSpotlight();
  if (result.tab) {
    selectTab(result.tab);
    return;
  }
  browserWindow.openTrustedLinkIn(result.url, "tab");
}

function moveHighlight(step: number): void {
  const count = results().length;
  if (count === 0) {
    return;
  }
  setHighlightIndex((index) => (index + step + count) % count);
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    closeSpotlight();
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveHighlight(1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveHighlight(-1);
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

function ResultRow(props: { result: SpotlightResult; index: number }) {
  return (
    <div
      class="nw-spotlight-result"
      data-highlighted={attributeFlag(props.index === highlightIndex())}
      onMouseMove={() => setHighlightIndex(props.index)}
      onMouseDown={(event: MouseEvent) => {
        event.preventDefault();
        runResult(props.result);
      }}
    >
      <span class="nw-spotlight-kind">{KIND_LABELS[props.result.kind]}</span>
      <span class="nw-spotlight-text">
        <span class="nw-spotlight-title">{props.result.title}</span>
        <span class="nw-spotlight-subtitle">{props.result.subtitle}</span>
      </span>
    </div>
  );
}

export function Spotlight() {
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
      <style>{spotlightStyle}</style>
      <div class="nw-spotlight-panel">
        <input
          id={INPUT_ID}
          class="nw-spotlight-input"
          placeholder="Search or enter address"
          onInput={(event: InputEvent) =>
            updateResults((event.currentTarget as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          onBlur={closeSpotlight}
        />
        <Show when={results().length > 0}>
          <div class="nw-spotlight-results">
            <For each={results()}>
              {(result, index) => <ResultRow result={result} index={index()} />}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
