// SPDX-License-Identifier: MPL-2.0

// Glass popover under the downloads button listing this session's downloads,
// newest first, with the actions that fit each one's state.

import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { createPageBackdrop } from "../neoworks-ui/page-backdrop.ts";
import {
  cancelDownload,
  clearFinishedDownloads,
  openAllDownloads,
  openDownloadedFile,
  pauseDownload,
  removeDownload,
  restartDownload,
  showInFolder,
} from "./download-actions.ts";
import {
  clearAttention,
  downloadEntries,
  downloadEntry,
  downloadList,
} from "./download-list.ts";
import type { DownloadEntry, FirefoxDownload } from "./types.ts";
import glassStyle from "../neoworks-ui/glass.css?inline";
import iconStyle from "../neoworks-ui/icons.css?inline";
import downloadsStyle from "./downloads.css?inline";

const PANEL_ID = "neoworks-downloads-panel";
const BACKDROP_ID = "neoworks-downloads-backdrop";
// Keep in sync with the panel width in downloads.css.
const PANEL_WIDTH_PX = 340;
const PANEL_GAP_PX = 6;
const WINDOW_EDGE_PX = 8;

interface PanelPosition {
  top: number;
  left: number;
}

interface RowAction {
  icon: string;
  label: string;
  run(download: FirefoxDownload): void;
}

const [isOpen, setIsOpen] = createSignal(false);
const [position, setPosition] = createSignal<PanelPosition>({ top: 0, left: 0 });

export const downloadsPanelOpen = isOpen;

// Right-aligned under the anchor, kept inside the window.
function positionUnder(anchor: Element): PanelPosition {
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(WINDOW_EDGE_PX, rect.right - PANEL_WIDTH_PX - WINDOW_EDGE_PX);
  return { top: rect.bottom + PANEL_GAP_PX, left };
}

export function openDownloadsPanel(anchor: Element): void {
  setPosition(positionUnder(anchor));
  clearAttention();
  setIsOpen(true);
}

export function closeDownloadsPanel(): void {
  setIsOpen(false);
}

export function toggleDownloadsPanel(anchor: Element): void {
  if (isOpen()) {
    closeDownloadsPanel();
    return;
  }
  openDownloadsPanel(anchor);
}

const PAUSE: RowAction = { icon: "pause", label: "Pause", run: pauseDownload };
const RESUME: RowAction = { icon: "play", label: "Resume", run: restartDownload };
const RETRY: RowAction = {
  icon: "arrow-counter-clockwise",
  label: "Retry",
  run: restartDownload,
};
const CANCEL: RowAction = { icon: "x", label: "Cancel", run: cancelDownload };
const SHOW_IN_FOLDER: RowAction = {
  icon: "folder-open",
  label: "Show in folder",
  run: showInFolder,
};
const REMOVE: RowAction = { icon: "x", label: "Remove from list", run: removeDownload };

function downloadingActions(download: FirefoxDownload): RowAction[] {
  if (download.tryToKeepPartialData) {
    return [PAUSE, CANCEL];
  }
  return [CANCEL];
}

function rowActions(entry: DownloadEntry): RowAction[] {
  if (entry.state === "downloading") {
    return downloadingActions(entry.download);
  }
  if (entry.state === "paused") {
    return [RESUME, CANCEL];
  }
  if (entry.state === "done") {
    return [SHOW_IN_FOLDER, REMOVE];
  }
  return [RETRY, REMOVE];
}

function attributeFlag(enabled: boolean): string | undefined {
  if (enabled) {
    return "true";
  }
  return undefined;
}

// Only finished downloads open on click; clicks on the buttons don't count.
function handleRowClick(entry: DownloadEntry): void {
  if (entry.state !== "done") {
    return;
  }
  closeDownloadsPanel();
  openDownloadedFile(entry.download);
}

function ActionButton(props: { action: RowAction; download: FirefoxDownload }) {
  return (
    <button
      type="button"
      class="nw-downloads-icon-button"
      title={props.action.label}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        props.action.run(props.download);
      }}
    >
      <span class="nw-icon" data-icon={props.action.icon} />
    </button>
  );
}

function ProgressBar(props: { percent: number }) {
  return (
    <div class="nw-downloads-progress">
      <div class="nw-downloads-progress-fill" style={{ width: `${props.percent}%` }} />
    </div>
  );
}

function showsProgress(entry: DownloadEntry): boolean {
  return entry.state === "downloading" || entry.state === "paused";
}

// Finished downloads and downloads of unknown size have no bar.
function hasProgressBar(entry: DownloadEntry): boolean {
  return showsProgress(entry) && entry.progressPercent !== null;
}

function progressOf(entry: DownloadEntry): number {
  if (entry.progressPercent === null) {
    return 0;
  }
  return entry.progressPercent;
}

function DownloadRow(props: { download: FirefoxDownload }) {
  const entry = () => downloadEntry(props.download);

  return (
    <div
      class="nw-downloads-row"
      title={props.download.target.path}
      data-state={entry().state}
      data-openable={attributeFlag(entry().state === "done")}
      onClick={() => handleRowClick(entry())}
    >
      <span class="nw-icon nw-downloads-file-icon" data-icon="file" />
      <div class="nw-downloads-text">
        <span class="nw-downloads-name">{entry().fileName}</span>
        <span class="nw-downloads-status">{entry().statusText}</span>
        <Show when={hasProgressBar(entry())}>
          <ProgressBar percent={progressOf(entry())} />
        </Show>
      </div>
      <div class="nw-downloads-actions">
        <For each={rowActions(entry())}>
          {(action) => <ActionButton action={action} download={props.download} />}
        </For>
      </div>
    </div>
  );
}

function hasFinishedDownloads(): boolean {
  return downloadEntries().some((entry) => entry.state !== "downloading");
}

function PanelHeader() {
  return (
    <div class="nw-downloads-header">
      <span class="nw-downloads-title">Downloads</span>
      <Show when={hasFinishedDownloads()}>
        <button
          type="button"
          class="nw-downloads-text-button"
          onClick={clearFinishedDownloads}
        >
          Clear
        </button>
      </Show>
    </div>
  );
}

function PanelFooter() {
  return (
    <button
      type="button"
      class="nw-downloads-footer"
      onClick={() => {
        closeDownloadsPanel();
        openAllDownloads();
      }}
    >
      <span class="nw-icon" data-icon="clock-counter-clockwise" />
      <span class="nw-downloads-footer-label">Show all downloads</span>
    </button>
  );
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!isOpen() || event.key !== "Escape") {
    return;
  }
  event.preventDefault();
  closeDownloadsPanel();
}

export function DownloadsPanel() {
  const backdrop = createPageBackdrop(PANEL_ID, BACKDROP_ID);
  createEffect(() => {
    if (isOpen()) {
      backdrop.start();
      return;
    }
    backdrop.stop();
  });

  addEventListener("keydown", handleKeyDown, true);
  onCleanup(() => {
    backdrop.stop();
    removeEventListener("keydown", handleKeyDown, true);
  });

  return (
    <div
      id="neoworks-downloads"
      data-open={attributeFlag(isOpen())}
      onMouseDown={(event: MouseEvent) => {
        if (event.target === event.currentTarget) {
          closeDownloadsPanel();
        }
      }}
    >
      <style>{glassStyle + iconStyle + downloadsStyle}</style>
      <div
        id={PANEL_ID}
        class="nw-downloads-panel nw-glass"
        style={{ top: `${position().top}px`, left: `${position().left}px` }}
      >
        <canvas id={BACKDROP_ID} class="nw-glass-backdrop" />
        <PanelHeader />
        <div class="nw-downloads-list">
          <For
            each={downloadList()}
            fallback={<div class="nw-downloads-empty">No downloads yet</div>}
          >
            {(download) => <DownloadRow download={download} />}
          </For>
        </div>
        <PanelFooter />
      </div>
    </div>
  );
}
