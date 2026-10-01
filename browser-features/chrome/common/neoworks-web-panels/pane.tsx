// SPDX-License-Identifier: MPL-2.0

// The open panel: a rounded pane between the sidebar and the page, with a
// handle on its right edge to change its width.

import { createEffect, createSignal, Show } from "solid-js";
import { goBackInPanel, openPanelAsTab } from "./actions.ts";
import { FRAME_ID, panelTitle, reloadPanel, showPanelBrowser } from "./panel-browsers.ts";
import { activePanel, clampWidth, setPanelWidth, showPanel } from "./store.ts";
import type { WebPanel } from "./types.ts";

const WIDTH_PROPERTY = "--nw-web-panel-width";
const OPEN_ATTRIBUTE = "nw-web-panel-open";

// The width while dragging; the pref is written once on release.
const [dragWidth, setDragWidth] = createSignal<number | null>(null);

function paneWidth(): number {
  return dragWidth() ?? activePanel()?.width ?? 0;
}

function startResize(event: PointerEvent, panel: WebPanel): void {
  const handle = event.currentTarget as HTMLElement;
  const startX = event.clientX;
  const startWidth = panel.width;
  handle.setPointerCapture(event.pointerId);
  const move = (moveEvent: PointerEvent) => {
    setDragWidth(clampWidth(startWidth + moveEvent.clientX - startX));
  };
  const end = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("lostpointercapture", end);
    const width = dragWidth();
    setDragWidth(null);
    if (width !== null) {
      setPanelWidth(panel.id, width);
    }
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("lostpointercapture", end);
}

function HeaderButton(props: { icon: string; title: string; onClick(): void }) {
  return (
    <button type="button" class="nw-web-panel-button" title={props.title} onClick={props.onClick}>
      <span class="nw-icon" data-icon={props.icon} />
    </button>
  );
}

function PaneHeader(props: { panel: WebPanel }) {
  return (
    <div class="nw-web-panel-header">
      <HeaderButton icon="arrow-left" title="Back" onClick={() => goBackInPanel(props.panel)} />
      <span class="nw-web-panel-title">{panelTitle(props.panel)}</span>
      <HeaderButton
        icon="arrow-counter-clockwise"
        title="Back to the pinned page"
        onClick={() => reloadPanel(props.panel)}
      />
      <HeaderButton
        icon="arrow-square-out"
        title="Open as tab"
        onClick={() => openPanelAsTab(props.panel)}
      />
      <HeaderButton icon="x" title="Hide panel" onClick={() => showPanel(null)} />
    </div>
  );
}

// Always mounted: panel-browsers.ts puts the <browser>s into the frame by id,
// since solid-xul has no refs.
export function WebPanelPane() {
  createEffect(() => {
    showPanelBrowser(activePanel());
  });
  createEffect(() => {
    const open = activePanel() !== undefined;
    document.documentElement.toggleAttribute(OPEN_ATTRIBUTE, open);
    document.documentElement.style.setProperty(WIDTH_PROPERTY, `${paneWidth()}px`);
  });

  return (
    <div
      id="neoworks-web-panel"
      data-open={activePanel() ? "true" : undefined}
      data-resizing={dragWidth() !== null ? "true" : undefined}
    >
      <Show when={activePanel()}>{(panel) => <PaneHeader panel={panel()} />}</Show>
      <div id={FRAME_ID} class="nw-web-panel-frame" />
      <Show when={activePanel()}>
        {(panel) => (
          <div
            class="nw-web-panel-resizer"
            title="Drag to resize"
            onPointerDown={(event: PointerEvent) => startResize(event, panel())}
          />
        )}
      </Show>
    </div>
  );
}

export function clearPaneLayout(): void {
  document.documentElement.removeAttribute(OPEN_ATTRIBUTE);
  document.documentElement.style.removeProperty(WIDTH_PROPERTY);
}
