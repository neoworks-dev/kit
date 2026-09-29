// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import {
  NW_COMMAND_EVENT,
  type NWCommandInvocation,
} from "#features-modules/common/NWKeymap.ts";
import { listenForChromeKeys } from "./chrome-keys.ts";
import { PAGE_COMMANDS } from "./page-commands.ts";
import { QUICKMARK_COMMANDS } from "./quickmarks.ts";
import { registerCommands, runCommand } from "./registry.ts";
import { TAB_COMMANDS } from "./tab-commands.ts";

// Dispatched by NWKeysParent when a key binding completes in web content.
function handleCommandEvent(event: Event): void {
  runCommand((event as CustomEvent<NWCommandInvocation>).detail);
}

@noraComponent(import.meta.hot)
export default class NeoworksCommands extends NoraComponentBase {
  init(): void {
    const unregister = registerCommands([
      ...TAB_COMMANDS,
      ...PAGE_COMMANDS,
      ...QUICKMARK_COMMANDS,
    ]);
    addEventListener(NW_COMMAND_EVENT, handleCommandEvent);
    const stopChromeKeys = listenForChromeKeys(runCommand);

    onCleanup(() => {
      unregister();
      removeEventListener(NW_COMMAND_EVENT, handleCommandEvent);
      stopChromeKeys();
    });
  }
}
