// SPDX-License-Identifier: MPL-2.0

// Marks the tab the user is looking at when it serves a Grove worktree: a
// pill over the page's top with the worktree, what the agent is doing, and
// Take back; and, while an agent's command runs, a frame around the page.
// Laid over the page from chrome like the AI sidebar's indicator, since the
// page covers anything its container paints. NWGrove.sys.mts sets the
// nw-grove and nw-grove-activity attributes this reads.

import { createSignal, onCleanup, Show } from "solid-js";
import { groveEnabled, groveModule, groveState, stateNote } from "./grove.ts";

const GROVE = "nw-grove";
const ACTIVITY = "nw-grove-activity";

interface Placement {
  browser: XULBrowserElement;
  worktree: string;
  activity: string | null;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function GroveTabIndicator(props: { style: string }) {
  const [placement, setPlacement] = createSignal<Placement | null>(null);

  const update = () => {
    const tab = gBrowser.selectedTab as Element;
    const browser = gBrowser.selectedBrowser as unknown as XULBrowserElement | undefined;
    const container = browser?.closest(".browserContainer");
    const worktree = tab.getAttribute(GROVE);
    if (!worktree || !browser || !container) {
      setPlacement(null);
      return;
    }
    const rect = container.getBoundingClientRect();
    setPlacement({
      browser,
      worktree,
      activity: tab.getAttribute(ACTIVITY),
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
  };

  const tabs = gBrowser.tabContainer as EventTarget;
  tabs.addEventListener("TabSelect", update);
  tabs.addEventListener("TabAttrModified", update);
  window.addEventListener("resize", update);
  const panels = document.getElementById("tabbrowser-tabpanels");
  const resizes = new ResizeObserver(update);
  if (panels) {
    resizes.observe(panels);
  }
  onCleanup(() => {
    tabs.removeEventListener("TabSelect", update);
    tabs.removeEventListener("TabAttrModified", update);
    window.removeEventListener("resize", update);
    resizes.disconnect();
  });
  update();

  // What the pill says after the worktree's name.
  const status = (place: Placement): string => {
    if (place.activity) {
      return place.activity;
    }
    const note = stateNote(groveState());
    if (note) {
      return note;
    }
    return "Agents can use this tab";
  };

  return (
    <div id="neoworks-grove-indicator">
      <style>{props.style}</style>
      <Show when={groveEnabled() && placement()}>
        {(place) => (
          <>
            <Show when={place().activity}>
              <div
                class="nw-grove-frame"
                style={{
                  left: `${place().left}px`,
                  top: `${place().top}px`,
                  width: `${place().width}px`,
                  height: `${place().height}px`,
                }}
              />
            </Show>
            <div
              class="nw-grove-pill"
              data-active={place().activity ? "true" : undefined}
              style={{ left: `${place().left + place().width / 2}px`, top: `${place().top + 10}px` }}
            >
              <span class="nw-icon nw-grove-icon" data-icon="git-branch" />
              <span class="nw-grove-worktree">{place().worktree}</span>
              <span class="nw-grove-status">{status(place())}</span>
              <button
                type="button"
                class="nw-grove-take-back"
                title="Stop serving this worktree; Grove's agents lose the tab"
                onClick={() => void groveModule().withdrawTab(place().browser)}
              >
                Take back
              </button>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
