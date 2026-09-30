// SPDX-License-Identifier: MPL-2.0

// Drawn over the page: the dividers between split panes (drag to resize, the
// plus in the middle adds a pane there) and, while a tab is dragged from the
// sidebar, the drop targets that split the page.

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

// Pinned tabs and Essentials can't join a split view.
function droppableTab(): SplitTab | null {
  const tab = draggedTab() as SplitTab | null;
  if (!tab || tab.pinned) {
    return null;
  }
  return tab;
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

export function SplitOverlay(props: { style: string }) {
  return (
    <div id="neoworks-split-overlay">
      <style>{props.style}</style>
      {/* Index keeps each divider's element across layouts, so a resize
          drag keeps its pointer capture. */}
      <Index each={activeLayout()?.dividers ?? []}>
        {(divider) => <Divider divider={divider()} />}
      </Index>
      <Show when={draggingTab() && droppableTab()}>
        <DropTargets />
      </Show>
    </div>
  );
}
