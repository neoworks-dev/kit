// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/solid-xul";
import { Spotlight } from "./spotlight.tsx";

export function mountSpotlight(container: Element): void {
  render(() => <Spotlight />, container, { hotCtx: import.meta.hot });
}
