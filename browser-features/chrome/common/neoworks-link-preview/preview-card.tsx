// SPDX-License-Identifier: MPL-2.0

import {
  bounds,
  closePreview,
  FRAME_ID,
  openPreviewAsTab,
  preview,
} from "./link-preview.ts";
import type { Bounds } from "./types.ts";

function placement(rect: Bounds | null) {
  if (!rect) {
    return {};
  }
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

// Host and path without the scheme, like the URL bar shows it.
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function openFlag(): string | undefined {
  if (preview()) {
    return "true";
  }
  return undefined;
}

function loadingFlag(): string | undefined {
  if (preview()?.loading) {
    return "true";
  }
  return undefined;
}

// Always mounted: link-preview.ts puts the <browser> into the frame by id,
// since solid-xul has no refs.
export function LinkPreview(props: { style: string }) {
  return (
    <div id="neoworks-link-preview" data-open={openFlag()} style={placement(bounds())}>
      <style>{props.style}</style>
      <div class="nw-link-preview-scrim" onClick={closePreview} />
      <div class="nw-link-preview-card" data-loading={loadingFlag()}>
        <div class="nw-link-preview-header">
          <div class="nw-link-preview-titles">
            <span class="nw-link-preview-title">{preview()?.title ?? ""}</span>
            <span class="nw-link-preview-url">{displayUrl(preview()?.url ?? "")}</span>
          </div>
          <button
            type="button"
            class="nw-link-preview-open"
            title="Open as tab (Ctrl+Enter)"
            onClick={openPreviewAsTab}
          >
            <span class="nw-icon" data-icon="arrow-square-out" />
            <span>Open as tab</span>
          </button>
          <button
            type="button"
            class="nw-link-preview-close"
            title="Close (Esc)"
            onClick={closePreview}
          >
            <span class="nw-icon" data-icon="x" />
          </button>
        </div>
        <div class="nw-link-preview-progress" />
        <div id={FRAME_ID} class="nw-link-preview-frame" />
      </div>
    </div>
  );
}
