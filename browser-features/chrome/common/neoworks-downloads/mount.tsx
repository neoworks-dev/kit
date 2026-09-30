// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/solid-xul";
import { DownloadsPanel } from "./downloads-panel.tsx";

export function mountDownloadsPanel(container: Element): void {
  render(() => <DownloadsPanel />, container, { hotCtx: import.meta.hot });
}
