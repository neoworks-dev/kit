// SPDX-License-Identifier: MPL-2.0

// Tells the user when the AI agent is working in the tab they're looking at:
// a glowing frame around the page and a pill over its top with a Stop button.
// Both are laid over the page from chrome, since the page covers anything its
// container paints. The sidebar's tab badge reads the same nw-ai-controlled
// attribute, which NWAgentBrowser.sys.mts sets on the tab.
//
// While the companion (the agent the user's apps share) is in this window,
// the frame stays up around whichever tab is selected. It opens out from the
// middle of the page, where the overlay's drop lands and its rings spread
// from, and draws back in there when the agent is pulled out.

import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import { agentBrowser } from "./chat.ts";
import {
  ARRIVAL_MS,
  companionArrivedAt,
  companionInThisWindow,
  companionLeftAt,
  companionState,
  LEAVING_MS,
  sendCompanionAway,
  stopCompanion,
} from "./companion.ts";

const CONTROLLED = "nw-ai-controlled";

interface Placement {
  tab: Element;
  // The agent is acting in this tab right now, not only present in the window.
  controlled: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function ControlIndicator(props: { style: string }) {
  const [placement, setPlacement] = createSignal<Placement | null>(null);
  const [arriving, setArriving] = createSignal(false);
  const [leaving, setLeaving] = createSignal(false);

  const update = () => {
    const tab = gBrowser.selectedTab as Element;
    const browser = gBrowser.selectedBrowser as unknown as Element | undefined;
    const container = browser?.closest(".browserContainer");
    const controlled = tab.hasAttribute(CONTROLLED);
    if ((!controlled && !companionInThisWindow() && !leaving()) || !container) {
      setPlacement(null);
      return;
    }
    const rect = container.getBoundingClientRect();
    setPlacement({ tab, controlled, left: rect.left, top: rect.top, width: rect.width, height: rect.height });
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
  createEffect(on(companionState, update));

  let arrivalTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(on(companionArrivedAt, (at) => {
    if (at === 0) {
      return;
    }
    update();
    setArriving(true);
    clearTimeout(arrivalTimer);
    arrivalTimer = setTimeout(() => setArriving(false), ARRIVAL_MS);
  }, { defer: true }));

  // The frame stays a moment after the agent leaves, to draw back in.
  let leavingTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(on(companionLeftAt, (at) => {
    if (at === 0) {
      return;
    }
    setArriving(false);
    setLeaving(true);
    update();
    clearTimeout(leavingTimer);
    leavingTimer = setTimeout(() => {
      setLeaving(false);
      update();
    }, LEAVING_MS);
  }, { defer: true }));

  onCleanup(() => {
    tabs.removeEventListener("TabSelect", update);
    tabs.removeEventListener("TabAttrModified", update);
    window.removeEventListener("resize", update);
    resizes.disconnect();
    clearTimeout(arrivalTimer);
    clearTimeout(leavingTimer);
  });
  update();

  const stopHere = (place: Placement) => {
    if (place.controlled) {
      agentBrowser().stopAgentInTab(place.tab);
      return;
    }
    stopCompanion();
  };

  const pillText = (place: Placement): string => {
    if (place.controlled) {
      return "AI is controlling this tab";
    }
    return "The agent is here";
  };

  return (
    <div id="neoworks-ai-control">
      <style>{props.style}</style>
      <Show when={placement()}>
        {(place) => (
          <>
            <div
              class="nw-ai-control-frame"
              data-arriving={arriving() ? "true" : undefined}
              data-leaving={leaving() ? "true" : undefined}
              style={{
                left: `${place().left}px`,
                top: `${place().top}px`,
                width: `${place().width}px`,
                height: `${place().height}px`,
              }}
            />
            <div
              class="nw-ai-control-pill"
              data-arriving={arriving() ? "true" : undefined}
              data-leaving={leaving() ? "true" : undefined}
              style={{ left: `${place().left + place().width / 2}px`, top: `${place().top + 10}px` }}
            >
              <span class="nw-icon nw-ai-control-icon" data-icon="sparkle" />
              <span>{pillText(place())}</span>
              <Show when={place().controlled || companionState().running}>
                <button type="button" class="nw-ai-control-stop" onClick={() => stopHere(place())}>
                  Stop
                </button>
              </Show>
              <Show when={companionInThisWindow()}>
                <button
                  type="button"
                  class="nw-ai-control-stop"
                  title="Send the agent back to the desktop"
                  onClick={sendCompanionAway}
                >
                  Send away
                </button>
              </Show>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
