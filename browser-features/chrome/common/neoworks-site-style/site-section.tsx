// SPDX-License-Identifier: MPL-2.0

// "This site" in the page actions menu: forced dark mode, a default zoom and
// custom CSS for every page of the site. CSS edits apply as you type.

import { createSignal, onCleanup, Show } from "solid-js";
import { readSiteSettings, updateSite } from "./site-settings.ts";
import { clearDefaultZoom, useCurrentZoomAsDefault } from "./zoom.ts";

const CSS_SAVE_DELAY_MS = 300;

function flag(enabled: boolean | undefined): string | undefined {
  if (enabled) {
    return "true";
  }
  return undefined;
}

function logFailure(action: string): (error: unknown) => void {
  return (error) => console.error(`[neoworks-site-style] ${action} failed:`, error);
}

function percent(zoom: number): number {
  return Math.round(zoom * 100);
}

function DarkModeRow(props: { site: string }) {
  const enabled = () => readSiteSettings(props.site).darkMode === true;
  return (
    <button
      type="button"
      class="nw-page-actions-item"
      role="switch"
      aria-checked={enabled() ? "true" : "false"}
      onClick={() => void updateSite(props.site, { darkMode: enabled() ? undefined : true })}
    >
      <span class="nw-icon" data-icon="moon" />
      <span class="nw-page-actions-item-label">Dark mode</span>
      <span class="nw-site-style-switch" data-checked={flag(enabled())}>
        <span class="nw-site-style-switch-thumb" />
      </span>
    </button>
  );
}

function ZoomRow(props: { site: string; zoomPercent: number; onZoomChange(): void }) {
  const defaultZoom = () => readSiteSettings(props.site).zoom;
  const useCurrent = () => {
    useCurrentZoomAsDefault(props.site, props.zoomPercent / 100).catch(
      logFailure("Setting the default zoom"),
    );
  };
  const clear = () => {
    clearDefaultZoom(props.site).then(props.onZoomChange).catch(
      logFailure("Clearing the default zoom"),
    );
  };
  return (
    <div class="nw-page-actions-item">
      <span class="nw-icon" data-icon="magnifying-glass-plus" />
      <span class="nw-page-actions-item-label">Default zoom</span>
      <Show
        when={defaultZoom()}
        fallback={
          <button type="button" class="nw-site-style-chip" onClick={useCurrent}>
            Use {props.zoomPercent}%
          </button>
        }
      >
        {(zoom) => (
          <button
            type="button"
            class="nw-site-style-chip"
            data-set="true"
            title="Clear the default zoom"
            onClick={clear}
          >
            {percent(zoom())}%
            <span class="nw-icon" data-icon="x" />
          </button>
        )}
      </Show>
    </div>
  );
}

function lineCount(css: string | undefined): string {
  const lines = css?.trim().split("\n").length ?? 0;
  if (lines === 0) {
    return "None";
  }
  if (lines === 1) {
    return "1 line";
  }
  return `${lines} lines`;
}

// Saves shortly after typing stops, and on close.
function CssEditor(props: { site: string }) {
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    if (pending === null) {
      return;
    }
    void updateSite(props.site, { css: pending });
    pending = null;
  };
  onCleanup(flush);
  return (
    <textarea
      class="nw-site-style-css"
      placeholder={"body {\n  font-size: 18px;\n}"}
      spellcheck={false}
      value={readSiteSettings(props.site).css ?? ""}
      onInput={(event: InputEvent) => {
        pending = (event.currentTarget as HTMLTextAreaElement).value;
        clearTimeout(timer);
        timer = setTimeout(flush, CSS_SAVE_DELAY_MS);
      }}
      onBlur={flush}
    />
  );
}

function CssRow(props: { site: string }) {
  const [editing, setEditing] = createSignal(false);
  return (
    <>
      <button
        type="button"
        class="nw-page-actions-item"
        aria-expanded={editing() ? "true" : "false"}
        onClick={() => setEditing(!editing())}
      >
        <span class="nw-icon" data-icon="code" />
        <span class="nw-page-actions-item-label">Custom CSS</span>
        <span class="nw-site-style-value">{lineCount(readSiteSettings(props.site).css)}</span>
      </button>
      <Show when={editing()}>
        <CssEditor site={props.site} />
      </Show>
    </>
  );
}

export function SiteStyleSection(
  props: { site: string; zoomPercent: number; onZoomChange(): void },
) {
  return (
    <div class="nw-page-actions-section nw-site-style">
      <span class="nw-site-style-heading">{props.site}</span>
      <DarkModeRow site={props.site} />
      <ZoomRow site={props.site} zoomPercent={props.zoomPercent} onZoomChange={props.onZoomChange} />
      <CssRow site={props.site} />
    </div>
  );
}
