// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/solid-xul";
import { ModeIndicator } from "./mode-indicator.tsx";
import { WhichKey } from "./which-key.tsx";

export function mountWhichKey(container: Element): void {
  render(() => <WhichKey />, container, { hotCtx: import.meta.hot });
}

export function mountModeIndicator(container: Element): void {
  render(() => <ModeIndicator />, container, { hotCtx: import.meta.hot });
}
