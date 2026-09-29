// SPDX-License-Identifier: MPL-2.0

import { Show } from "solid-js";
import { namedColor } from "../neoworks-sidebar/identity-colors.ts";
import type { SpotlightResult, SpotlightResultKind } from "./types.ts";

const SECTION_TITLES: Record<SpotlightResultKind, string> = {
  navigate: "",
  suggestion: "Suggestions",
  tab: "Tabs",
  workspace: "Workspaces",
  quickmark: "Quickmarks",
  command: "Commands",
  bookmark: "History & Bookmarks",
  history: "History & Bookmarks",
};

const KIND_ICONS: Record<SpotlightResultKind, string> = {
  navigate: "arrow-right",
  suggestion: "magnifying-glass",
  tab: "globe",
  // Workspace rows show their color dot instead.
  workspace: "sidebar-simple",
  quickmark: "bookmark-simple",
  command: "lightning",
  bookmark: "star",
  history: "clock-counter-clockwise",
};

export function sectionTitle(result: SpotlightResult): string {
  return SECTION_TITLES[result.kind];
}

// Section header before the first row of each kind group.
export function startsSection(results: SpotlightResult[], index: number): boolean {
  const title = sectionTitle(results[index]);
  if (!title) {
    return false;
  }
  return index === 0 || sectionTitle(results[index - 1]) !== title;
}

// `page-icon:` serves Places favicons (with a default) to chrome documents.
function faviconOf(result: SpotlightResult): string {
  if (result.kind === "tab") {
    return result.tab.image;
  }
  if (result.kind === "history" || result.kind === "bookmark") {
    return "page-icon:" + result.url;
  }
  return "";
}

function dotColorOf(result: SpotlightResult): string {
  if (result.kind === "workspace") {
    return namedColor(result.workspace.color);
  }
  return "";
}

function shortcutOf(result: SpotlightResult): string {
  if (result.kind === "command" || result.kind === "workspace") {
    return result.shortcut;
  }
  return "";
}

function attributeFlag(enabled: boolean): string | undefined {
  if (enabled) {
    return "true";
  }
  return undefined;
}

function FaviconOrKindIcon(props: { result: SpotlightResult }) {
  const icon = <span class="nw-icon" data-icon={KIND_ICONS[props.result.kind]} />;
  return (
    <Show when={faviconOf(props.result)} fallback={icon}>
      <img class="nw-spotlight-favicon" src={faviconOf(props.result)} alt="" />
    </Show>
  );
}

function ResultIcon(props: { result: SpotlightResult }) {
  return (
    <Show
      when={dotColorOf(props.result)}
      fallback={<FaviconOrKindIcon result={props.result} />}
    >
      <span class="nw-spotlight-dot" style={{ background: dotColorOf(props.result) }} />
    </Show>
  );
}

export interface ResultRowProps {
  result: SpotlightResult;
  highlighted: boolean;
  onHover: () => void;
  onRun: () => void;
}

export function ResultRow(props: ResultRowProps) {
  return (
    <div
      class="nw-spotlight-result"
      data-highlighted={attributeFlag(props.highlighted)}
      onMouseMove={props.onHover}
      onMouseDown={(event: MouseEvent) => {
        event.preventDefault();
        props.onRun();
      }}
    >
      <ResultIcon result={props.result} />
      <span class="nw-spotlight-title">{props.result.title}</span>
      <Show when={props.result.subtitle}>
        <span class="nw-spotlight-subtitle">{props.result.subtitle}</span>
      </Show>
      <Show when={shortcutOf(props.result)}>
        <kbd class="nw-spotlight-shortcut">{shortcutOf(props.result)}</kbd>
      </Show>
    </div>
  );
}
