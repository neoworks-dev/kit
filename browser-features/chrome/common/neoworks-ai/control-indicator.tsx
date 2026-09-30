// SPDX-License-Identifier: MPL-2.0

// Tells the user when the AI agent is working in the tab they're looking at:
// a glowing frame around the page and a pill over its top with a Stop button.
// Both are laid over the page from chrome, since the page covers anything its
// container paints. The sidebar's tab badge reads the same nw-ai-controlled
// attribute, which NWAgentBrowser.sys.mts sets on the tab.

import { createSignal, onCleanup, Show } from "solid-js";
import { agentBrowser } from "./chat.ts";

const CONTROLLED = "nw-ai-controlled";

interface Placement {
  tab: Element;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function ControlIndicator(props: { style: string }) {
  const [placement, setPlacement] = createSignal<Placement | null>(null);

  const update = () => {
    const tab = gBrowser.selectedTab as Element;
    const browser = gBrowser.selectedBrowser as unknown as Element | undefined;
    const container = browser?.closest(".browserContainer");
    if (!tab.hasAttribute(CONTROLLED) || !container) {
      setPlacement(null);
      return;
    }
    const rect = container.getBoundingClientRect();
    setPlacement({ tab, left: rect.left, top: rect.top, width: rect.width, height: rect.height });
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

  return (
    <div id="neoworks-ai-control">
      <style>{props.style}</style>
      <Show when={placement()}>
        {(place) => (
          <>
            <div
              class="nw-ai-control-frame"
              style={{
                left: `${place().left}px`,
                top: `${place().top}px`,
                width: `${place().width}px`,
                height: `${place().height}px`,
              }}
            />
            <div
              class="nw-ai-control-pill"
              style={{ left: `${place().left + place().width / 2}px`, top: `${place().top + 10}px` }}
            >
              <span class="nw-icon nw-ai-control-icon" data-icon="sparkle" />
              <span>AI is controlling this tab</span>
              <button
                type="button"
                class="nw-ai-control-stop"
                onClick={() => agentBrowser().stopAgentInTab(place().tab)}
              >
                Stop
              </button>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
