// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/solid-xul";
import { SplitOverlay } from "./split-overlay.tsx";
import iconStyle from "../neoworks-ui/icons.css?inline";
import splitStyle from "./split.css?inline";

export function mountSplitOverlay(browserBox: Element): void {
  render(() => <SplitOverlay style={iconStyle + splitStyle} />, browserBox, {
    hotCtx: import.meta.hot,
  });
}
