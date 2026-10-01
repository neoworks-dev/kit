// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { registerCommands } from "../neoworks-commands/registry.ts";
import { mountOnboarding } from "./mount.tsx";
import { openOnboarding, shouldOpenOnLaunch } from "./onboarding.ts";

const browserWindow = window as unknown as { delayedStartupPromise: Promise<void> };

@noraComponent(import.meta.hot)
export default class NeoworksOnboarding extends NoraComponentBase {
  init(): void {
    if (!document.body) {
      console.error("[neoworks-onboarding] Browser chrome is unavailable at init.");
      return;
    }
    mountOnboarding(document.body);
    onCleanup(registerCommands([{ id: "onboarding:open", listed: true, run: openOnboarding }]));

    // After session restore and the first page, so the setup sits over the
    // window the user will keep using.
    if (shouldOpenOnLaunch()) {
      browserWindow.delayedStartupPromise
        .then(() => {
          if (shouldOpenOnLaunch()) {
            openOnboarding();
          }
        })
        .catch((error) => console.error("[neoworks-onboarding] Couldn't open the setup:", error));
    }
  }
}
