// SPDX-License-Identifier: MPL-2.0

// Drawn over the page: the dividers between split panes (drag to resize, the
// plus in the middle adds a pane there), a handle at the top of each pane
// (drag to move the pane, take its tab out, or show only its tab) and, while
// a tab is dragged
// from the sidebar, the drop targets that split the page.

import { createSignal, For, Index, Show } from "solid-js";
import {
  draggedTab,
  draggingTab,
  endDrag,
} from "../neoworks-sidebar/tab-drag.ts";
import { nearestSide, sideRect } from "./layout.ts";
import {
  activeLayout,
  addPaneAt,
  contentBounds,
  removeFromSplit,
  showAlone,
  splitWith,
  startResize,
} from "./split-view.ts";
import type { DividerRect, DropSide, PaneRect, Rect, SplitTab } from "./types.ts";

interface DropChoice {
  target: SplitTab;
  side: DropSide;
  rect: Rect;
}

const [dropChoice, setDropChoice] = createSignal<DropChoice | null>(null);

function placement(rect: Rect) {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

function Divider(props: { divider: DividerRect }) {
  const row = () => props.divider.direction === "row";

  function beginResize(event: PointerEvent): void {
    // No preventDefault here: debug builds assert when chrome code cancels
    // pointerdown (WidgetEvent::PreventDefault). user-select: none in
    // split.css keeps the drag from selecting text instead.
    if (event.button !== 0) {
      return;
    }
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    handle.setAttribute("data-resizing", "true");
    const resize = startResize(props.divider);
    const start = row() ? event.clientX : event.clientY;
    const move = (moveEvent: PointerEvent) => {
      resize((row() ? moveEvent.clientX : moveEvent.clientY) - start);
    };
    const end = () => {
      handle.removeAttribute("data-resizing");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("lostpointercapture", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("lostpointercapture", end);
  }

  return (
    <div
      class="nw-split-divider"
      data-direction={props.divider.direction}
      style={placement(props.divider.rect)}
      onPointerDown={beginResize}
    >
      <span class="nw-split-divider-line" />
      <button
        type="button"
        class="nw-split-add"
        title="Add a split here"
        onPointerDown={(event: PointerEvent) => event.stopPropagation()}
        onClick={() => addPaneAt(props.divider)}
      >
        <span class="nw-icon" data-icon="plus" />
      </button>
    </div>
  );
}

// Without a split, the page itself is the one pane to split.
function dropPanes(): PaneRect<SplitTab>[] {
  const layout = activeLayout();
  if (layout) {
    return layout.panes;
  }
  const bounds = contentBounds();
  const selected = (window as unknown as { gBrowser: { selectedTab: SplitTab } }).gBrowser
    .selectedTab;
  if (!bounds) {
    return [];
  }
  return [{ item: selected, rect: bounds }];
}

function paneAt(x: number, y: number): PaneRect<SplitTab> | undefined {
  return dropPanes().find(({ rect }) =>
    x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
  );
}

// Pinned tabs and Essentials join as a copy of their page (splitWith).
function droppableTab(): SplitTab | null {
  return draggedTab() as SplitTab | null;
}

function chooseDrop(event: DragEvent): void {
  const tab = droppableTab();
  const target = paneAt(event.clientX, event.clientY);
  if (!tab || !target || target.item === tab) {
    setDropChoice(null);
    return;
  }
  event.preventDefault();
  const side = nearestSide(target.rect, event.clientX, event.clientY);
  setDropChoice({ target: target.item, side, rect: sideRect(target.rect, side) });
}

function drop(event: DragEvent): void {
  const choice = dropChoice();
  const tab = droppableTab();
  setDropChoice(null);
  if (!choice || !tab) {
    return;
  }
  event.preventDefault();
  endDrag();
  splitWith(choice.target, tab, choice.side);
}

function DropTargets() {
  return (
    <div
      class="nw-split-drop-area"
      style={placement(contentBounds() ?? { x: 0, y: 0, width: 0, height: 0 })}
      onDragOver={chooseDrop}
      onDragLeave={(event: DragEvent) => {
        if (event.target === event.currentTarget) {
          setDropChoice(null);
        }
      }}
      onDrop={drop}
    >
      <For each={dropPanes()}>
        {(entry) => (
          <div
            class="nw-split-drop-pane"
            style={placement({
              ...entry.rect,
              x: entry.rect.x - (contentBounds()?.x ?? 0),
              y: entry.rect.y - (contentBounds()?.y ?? 0),
            })}
          />
        )}
      </For>
      <Show when={dropChoice()}>
        {(choice) => (
          <div
            class="nw-split-drop-choice"
            style={placement({
              ...choice().rect,
              x: choice().rect.x - (contentBounds()?.x ?? 0),
              y: choice().rect.y - (contentBounds()?.y ?? 0),
            })}
          />
        )}
      </Show>
    </div>
  );
}

// The pane whose handle is being dragged to move it within the split.
const [movingTab, setMovingTab] = createSignal<SplitTab | null>(null);

const HANDLE_ZONE_WIDTH_PX = 220;
const HANDLE_ZONE_HEIGHT_PX = 10;

// A thin strip at the top center of the pane. Pages don't pass pointer
// moves to the browser chrome, so hovering this strip is what reveals the
// handle; it covers only that much of the page.
function handleZone(rect: Rect): Rect {
  const width = Math.min(HANDLE_ZONE_WIDTH_PX, rect.width - 24);
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y,
    width,
    height: HANDLE_ZONE_HEIGHT_PX,
  };
}

function PaneHandle(props: { pane: PaneRect<SplitTab> }) {
  function beginMove(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    const grip = event.currentTarget as HTMLElement;
    grip.setPointerCapture(event.pointerId);
    const tab = props.pane.item;
    setMovingTab(tab);
    const move = (moveEvent: PointerEvent) => {
      const target = paneAt(moveEvent.clientX, moveEvent.clientY);
      if (!target || target.item === tab) {
        setDropChoice(null);
        return;
      }
      const side = nearestSide(target.rect, moveEvent.clientX, moveEvent.clientY);
      setDropChoice({ target: target.item, side, rect: sideRect(target.rect, side) });
    };
    const end = (endEvent: Event) => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", end);
      grip.removeEventListener("lostpointercapture", end);
      const choice = dropChoice();
      setDropChoice(null);
      setMovingTab(null);
      if (choice && endEvent.type === "pointerup") {
        splitWith(choice.target, tab, choice.side);
      }
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", end);
    grip.addEventListener("lostpointercapture", end);
  }

  return (
    <div
      class="nw-split-handle-zone"
      data-moving={movingTab() === props.pane.item ? "true" : undefined}
      style={placement(handleZone(props.pane.rect))}
    >
      <div class="nw-split-handle">
        <span class="nw-split-grip" title="Drag to move this pane" onPointerDown={beginMove}>
          <span class="nw-icon" data-icon="dots-six" />
        </span>
        <button
          type="button"
          class="nw-split-handle-button"
          title="Take this tab out of the split"
          onClick={() => removeFromSplit(props.pane.item)}
        >
          <span class="nw-icon" data-icon="arrow-square-out" />
        </button>
        <button
          type="button"
          class="nw-split-handle-button"
          title="Show only this tab"
          onClick={() => showAlone(props.pane.item)}
        >
          <span class="nw-icon" data-icon="arrows-out-simple" />
        </button>
      </div>
    </div>
  );
}

export function SplitOverlay(props: { style: string }) {
  return (
    <div id="neoworks-split-overlay" data-moving={movingTab() ? "true" : undefined}>
      <style>{props.style}</style>
      {/* Index keeps each divider's and handle's element across layouts, so
          a resize or move drag keeps its pointer capture. */}
      <Index each={activeLayout()?.dividers ?? []}>
        {(divider) => <Divider divider={divider()} />}
      </Index>
      <Index each={activeLayout()?.panes ?? []}>
        {(entry) => <PaneHandle pane={entry()} />}
      </Index>
      <Show when={movingTab() && dropChoice()}>
        {(choice) => (
          <div class="nw-split-drop-choice nw-split-move-choice" style={placement(choice().rect)} />
        )}
      </Show>
      <Show when={draggingTab() && droppableTab()}>
        <DropTargets />
      </Show>
    </div>
  );
}
