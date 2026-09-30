// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/solid-xul";
import { AiPanel } from "./ai-panel.tsx";
import glassStyle from "../neoworks-ui/glass.css?inline";
import iconStyle from "../neoworks-ui/icons.css?inline";
import aiStyle from "./ai.css?inline";
import indicatorStyle from "./control-indicator.css?inline";
import { ControlIndicator } from "./control-indicator.tsx";

// The last child of #browser, so it sits right of the tab panels.
export function mountAiPanel(browserBox: Element): void {
  render(() => <AiPanel style={glassStyle + iconStyle + aiStyle} />, browserBox, {
    hotCtx: import.meta.hot,
  });
}

// Fixed over the page; placed from the selected tab's .browserContainer.
export function mountControlIndicator(browserBox: Element): void {
  render(() => <ControlIndicator style={glassStyle + iconStyle + indicatorStyle} />, browserBox, {
    hotCtx: import.meta.hot,
  });
}
