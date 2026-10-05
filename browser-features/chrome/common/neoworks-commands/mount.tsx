// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/solid-xul";
import { WhichKey } from "./which-key.tsx";

export function mountWhichKey(container: Element): void {
  render(() => <WhichKey />, container, { hotCtx: import.meta.hot });
}
