// SPDX-License-Identifier: MPL-2.0

// A split view in the tab list: its tabs boxed together, in layout order.

import { For } from "solid-js";
import { TabRow } from "./tab-row.tsx";
import type { BrowserSplitView, TabState } from "./types.ts";

export function SplitRow(props: { split: BrowserSplitView; tabState: TabState }) {
  const tabs = () => {
    props.tabState.revision();
    return props.split.tabs;
  };
  return (
    <div class="nw-split-group" title="Split view">
      <For each={tabs()}>
        {(tab) => <TabRow tab={tab} tabState={props.tabState} />}
      </For>
    </div>
  );
}
