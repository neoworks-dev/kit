// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/solid-xul";
import { LinkWindowHeader } from "./header.tsx";

// Last child of the toolbox, whose toolbars a minimal window hides.
export function mountLinkWindowHeader(toolbox: Element): void {
  render(() => <LinkWindowHeader />, toolbox, { hotCtx: import.meta.hot });
}
