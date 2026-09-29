// SPDX-License-Identifier: MPL-2.0

import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { createPageBackdrop } from "../neoworks-ui/page-backdrop.ts";
import {
  bookmarkPage,
  chromeWindow,
  clearSiteData,
  copyPageUrl,
  openSitePermissions,
  readPageState,
  resetZoom,
  takeScreenshot,
  toggleReaderMode,
  zoomIn,
  zoomOut,
} from "./page-actions.ts";
import type { PageState } from "./types.ts";
import glassStyle from "../neoworks-ui/glass.css?inline";
import iconStyle from "../neoworks-ui/icons.css?inline";
import pageActionsStyle from "./page-actions.css?inline";

const PANEL_ID = "neoworks-page-actions-panel";
const BACKDROP_ID = "neoworks-page-actions-backdrop";
// Keep in sync with the panel width in page-actions.css.
const PANEL_WIDTH_PX = 280;
const PANEL_GAP_PX = 6;
const WINDOW_EDGE_PX = 8;

interface PanelPosition {
  top: number;
  left: number;
}

interface PageTool {
  icon: string;
  label: string;
  enabled: boolean;
  run(event: MouseEvent): void | Promise<void>;
}

const [isOpen, setIsOpen] = createSignal(false);
const [pageState, setPageState] = createSignal<PageState | null>(null);
const [position, setPosition] = createSignal<PanelPosition>({ top: 0, left: 0 });

// Right-aligned under the anchor, kept inside the window.
function positionUnder(anchor: Element): PanelPosition {
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(WINDOW_EDGE_PX, rect.right - PANEL_WIDTH_PX);
  return { top: rect.bottom + PANEL_GAP_PX, left };
}

export function openPageActions(anchor: Element): void {
  setPosition(positionUnder(anchor));
  setPageState(readPageState());
  setIsOpen(true);
}

export function closePageActions(): void {
  setIsOpen(false);
}

export function togglePageActions(anchor: Element): void {
  if (isOpen()) {
    closePageActions();
    return;
  }
  openPageActions(anchor);
}

function refreshPageState(): void {
  setPageState(readPageState());
}

function logFailure(action: string): (error: unknown) => void {
  return (error) => console.error(`[neoworks-toolbar] ${action} failed:`, error);
}

// Tools hand over to their own UI (screenshot overlay, bookmark panel,
// dialogs), so the menu closes first.
function runAndClose(label: string, run: (event: MouseEvent) => void | Promise<void>) {
  return (event: MouseEvent) => {
    closePageActions();
    Promise.resolve()
      .then(() => run(event))
      .catch(logFailure(label));
  };
}

// Zoom keeps the menu open so repeated clicks show the new level.
function zoomThen(label: string, zoom: () => Promise<void>) {
  return () => {
    zoom().then(refreshPageState).catch(logFailure(label));
  };
}

function readerLabel(state: PageState): string {
  if (state.readerActive) {
    return "Exit reader";
  }
  return "Reader";
}

function pageTools(state: PageState): PageTool[] {
  return [
    { icon: "camera", label: "Screenshot", enabled: true, run: takeScreenshot },
    { icon: "bookmark-simple", label: "Bookmark", enabled: true, run: bookmarkPage },
    {
      icon: "book-open",
      label: readerLabel(state),
      enabled: state.readerAvailable,
      run: toggleReaderMode,
    },
    { icon: "link", label: "Copy link", enabled: true, run: copyPageUrl },
  ];
}

function connectionIcon(state: PageState): string {
  if (state.secure) {
    return "lock";
  }
  return "lock-open";
}

function connectionLabel(state: PageState): string {
  if (state.secure) {
    return "Connection is secure";
  }
  return "Connection is not secure";
}

function attributeFlag(enabled: boolean): string | undefined {
  if (enabled) {
    return "true";
  }
  return undefined;
}

function ToolGrid(props: { state: PageState }) {
  return (
    <div class="nw-page-actions-tools">
      <For each={pageTools(props.state)}>
        {(tool) => (
          <button
            type="button"
            class="nw-page-actions-tool"
            title={tool.label}
            disabled={attributeFlag(!tool.enabled)}
            onClick={runAndClose(tool.label, tool.run)}
          >
            <span class="nw-icon" data-icon={tool.icon} />
            <span class="nw-page-actions-tool-label">{tool.label}</span>
          </button>
        )}
      </For>
    </div>
  );
}

function ZoomRow(props: { state: PageState }) {
  return (
    <div class="nw-page-actions-section nw-page-actions-zoom">
      <span class="nw-page-actions-item-label">Zoom</span>
      <button
        type="button"
        class="nw-page-actions-icon-button"
        title="Zoom out"
        onClick={zoomThen("Zoom out", zoomOut)}
      >
        <span class="nw-icon" data-icon="minus" />
      </button>
      <button
        type="button"
        class="nw-page-actions-zoom-value"
        title="Reset zoom"
        onClick={zoomThen("Reset zoom", resetZoom)}
      >
        {props.state.zoomPercent}%
      </button>
      <button
        type="button"
        class="nw-page-actions-icon-button"
        title="Zoom in"
        onClick={zoomThen("Zoom in", zoomIn)}
      >
        <span class="nw-icon" data-icon="plus" />
      </button>
    </div>
  );
}

function SiteSection(props: { state: PageState }) {
  return (
    <div class="nw-page-actions-section">
      <div class="nw-page-actions-item" data-secure={attributeFlag(props.state.secure)}>
        <span class="nw-icon nw-page-actions-connection" data-icon={connectionIcon(props.state)} />
        <span class="nw-page-actions-item-label">{connectionLabel(props.state)}</span>
      </div>
      <button
        type="button"
        class="nw-page-actions-item"
        onClick={runAndClose("Site permissions", openSitePermissions)}
      >
        <span class="nw-icon" data-icon="shield-check" />
        <span class="nw-page-actions-item-label">Site permissions</span>
      </button>
      <button
        type="button"
        class="nw-page-actions-item"
        onClick={runAndClose("Clear site data", () => clearSiteData(props.state.host))}
      >
        <span class="nw-icon" data-icon="cookie" />
        <span class="nw-page-actions-item-label">Clear cookies and site data</span>
      </button>
    </div>
  );
}

function PanelContent(props: { state: PageState }) {
  return (
    <>
      <ToolGrid state={props.state} />
      <ZoomRow state={props.state} />
      <Show when={props.state.host !== ""}>
        <SiteSection state={props.state} />
      </Show>
    </>
  );
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!isOpen() || event.key !== "Escape") {
    return;
  }
  event.preventDefault();
  closePageActions();
}

export function PageActionsMenu() {
  const backdrop = createPageBackdrop(PANEL_ID, BACKDROP_ID);
  createEffect(() => {
    if (isOpen()) {
      backdrop.start();
      return;
    }
    backdrop.stop();
  });

  const tabContainer = chromeWindow().gBrowser.tabContainer;
  window.addEventListener("keydown", handleKeyDown, true);
  tabContainer.addEventListener("TabSelect", closePageActions);
  onCleanup(() => {
    backdrop.stop();
    window.removeEventListener("keydown", handleKeyDown, true);
    tabContainer.removeEventListener("TabSelect", closePageActions);
  });

  return (
    <div
      id="neoworks-page-actions"
      data-open={attributeFlag(isOpen())}
      onMouseDown={(event: MouseEvent) => {
        if (event.target === event.currentTarget) {
          closePageActions();
        }
      }}
    >
      <style>{glassStyle + iconStyle + pageActionsStyle}</style>
      <div
        id={PANEL_ID}
        class="nw-page-actions-panel nw-glass"
        style={{ top: `${position().top}px`, left: `${position().left}px` }}
      >
        <canvas id={BACKDROP_ID} class="nw-glass-backdrop" />
        <Show when={pageState()}>
          {(state) => <PanelContent state={state()} />}
        </Show>
      </div>
    </div>
  );
}
