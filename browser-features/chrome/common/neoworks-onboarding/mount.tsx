// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/solid-xul";
import { Onboarding } from "./onboarding.tsx";

export function mountOnboarding(container: Element): void {
  render(() => <Onboarding />, container, { hotCtx: import.meta.hot });
}
