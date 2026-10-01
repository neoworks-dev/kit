// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/solid-xul";
import { WebPanelPane } from "./pane.tsx";
import { WebPanelMenu } from "./panel-menu.tsx";

export function mountWebPanelPane(browserBox: Element): void {
  render(() => <WebPanelPane />, browserBox, { hotCtx: import.meta.hot });
}

export function mountWebPanelMenu(popupSet: Element): void {
  render(() => <WebPanelMenu />, popupSet, { hotCtx: import.meta.hot });
}
