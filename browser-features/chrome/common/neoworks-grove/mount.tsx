// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/solid-xul";
import glassStyle from "../neoworks-ui/glass.css?inline";
import iconStyle from "../neoworks-ui/icons.css?inline";
import groveStyle from "./grove.css?inline";
import { GroveTabIndicator } from "./tab-indicator.tsx";

// Fixed over the page; placed from the selected tab's .browserContainer.
// Nothing while the developer setting is off.
export function mountGroveIndicator(browserBox: Element): void {
  // The indicator's own root stays put whatever it shows: a render root
  // that turns empty clears every child of #browser, the tab panels too.
  render(() => <GroveTabIndicator style={glassStyle + iconStyle + groveStyle} />, browserBox, {
    hotCtx: import.meta.hot,
  });
}
