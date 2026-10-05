// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import {
  NW_COMMAND_EVENT,
  NW_KEYS_MODE_EVENT,
  NW_KEYS_PENDING_EVENT,
  type NWCommandInvocation,
} from "#features-modules/common/NWKeymap.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import { listenForChromeKeys } from "./chrome-keys.ts";
import { handleKeyModeEvent, refreshSelectedTabMode } from "./key-mode.ts";
import { mountWhichKey } from "./mount.tsx";
import { redirectNativeShortcuts } from "./native-shortcuts.ts";
import { PAGE_COMMANDS } from "./page-commands.ts";
import { QUICKMARK_COMMANDS } from "./quickmarks.ts";
import { registerCommands, runCommand } from "./registry.ts";
import { TAB_COMMANDS } from "./tab-commands.ts";
import { hidePendingKeys, showPendingKeys } from "./which-key.tsx";

// Dispatched by NWKeysParent when a key binding completes in web content.
function handleCommandEvent(event: Event): void {
  runCommand((event as CustomEvent<NWCommandInvocation>).detail);
}

// Dispatched by NWKeysParent and the chrome key listener.
function handlePendingEvent(event: Event): void {
  showPendingKeys((event as CustomEvent<{ keys: string[] }>).detail.keys);
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
    addEventListener(NW_KEYS_PENDING_EVENT, handlePendingEvent);
    addEventListener(NW_KEYS_MODE_EVENT, handleKeyModeEvent);
    // A sequence pending in the previous tab can no longer complete.
    tabbrowser().tabContainer.addEventListener("TabSelect", hidePendingKeys);
    tabbrowser().tabContainer.addEventListener("TabSelect", refreshSelectedTabMode);
    const stopChromeKeys = listenForChromeKeys(runCommand);
    const restoreNativeShortcuts = redirectNativeShortcuts(runCommand);
    if (document.body) {
      mountWhichKey(document.body);
    }

    onCleanup(() => {
      unregister();
      removeEventListener(NW_COMMAND_EVENT, handleCommandEvent);
      removeEventListener(NW_KEYS_PENDING_EVENT, handlePendingEvent);
      removeEventListener(NW_KEYS_MODE_EVENT, handleKeyModeEvent);
      tabbrowser().tabContainer.removeEventListener("TabSelect", hidePendingKeys);
      tabbrowser().tabContainer.removeEventListener("TabSelect", refreshSelectedTabMode);
      stopChromeKeys();
      restoreNativeShortcuts();
    });
  }
}
