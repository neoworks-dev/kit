// SPDX-License-Identifier: MPL-2.0

import { createMemo, For, Show } from "solid-js";
import {
  closedTabs,
  recentlyClosedCollapsed,
  reopenClosedTab,
  toggleRecentlyClosed,
} from "./recently-closed.ts";
import { attributeFlag, Favicon } from "./tab-row.tsx";
import type { ClosedTab } from "./types.ts";

function ClosedTabRow(props: { tab: ClosedTab }) {
  return (
    <div
      class="nw-tab nw-closed-tab"
      title={`${props.tab.title}\n${props.tab.url}`}
      onClick={() => reopenClosedTab(props.tab)}
    >
      <Favicon source={props.tab.image} busy={false} />
      <span class="nw-tab-label">{props.tab.title}</span>
    </div>
  );
}

// Sits below the tab list's drop zone, so it rests at the bottom of the
// sidebar and scrolls with the list once the tabs fill it.
export function RecentlyClosedList() {
  const tabs = createMemo(closedTabs);
  return (
    <Show when={tabs().length > 0}>
      <div class="nw-recently-closed" data-collapsed={attributeFlag(recentlyClosedCollapsed())}>
        <div class="nw-recently-closed-header" onClick={toggleRecentlyClosed}>
          <span class="nw-icon nw-recently-closed-caret" data-icon="caret-right" />
          <span>Recently closed</span>
        </div>
        <Show when={!recentlyClosedCollapsed()}>
          <For each={tabs()}>{(tab) => <ClosedTabRow tab={tab} />}</For>
        </Show>
      </div>
    </Show>
  );
}
