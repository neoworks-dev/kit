// SPDX-License-Identifier: MPL-2.0

import type { ViteHotContext } from "vite/types/hot";
import { render } from "@nora/solid-xul";
import { TabContextMenu } from "./context-menu.tsx";
import { Sidebar } from "./sidebar.tsx";
import type { TabState } from "./types.ts";

// Inserted as the first child of #browser so it sits left of the tab panels.
export function mountSidebar(browserBox: Element, tabState: TabState): void {
  const options: { marker?: Element; hotCtx: ViteHotContext | undefined } = {
    hotCtx: import.meta.hot,
  };
  if (browserBox.firstElementChild) {
    options.marker = browserBox.firstElementChild;
  }
  render(() => <Sidebar tabState={tabState} />, browserBox, options);
}

export function mountTabContextMenu(popupSet: Element, tabState: TabState): void {
  render(() => <TabContextMenu tabState={tabState} />, popupSet, {
    hotCtx: import.meta.hot,
  });
}
