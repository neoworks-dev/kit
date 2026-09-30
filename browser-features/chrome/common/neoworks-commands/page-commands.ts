// SPDX-License-Identifier: MPL-2.0

import {
  NW_KEYS_RUN_IN_PAGE_MESSAGE,
  type NWPageCommandId,
} from "#features-modules/common/NWKeymap.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import type { NeoworksCommand } from "./registry.ts";

const KEYS_ACTOR_NAME = "NWKeys";

// Page commands run in the content process. Focus moves to the page first so
// follow-up keys (like hint labels) reach the NWKeys actor.
function runInSelectedPage(command: NWPageCommandId): void {
  const browser = tabbrowser().selectedBrowser;
  const windowGlobal = browser.browsingContext?.currentWindowGlobal;
  if (!windowGlobal) {
    return;
  }
  browser.focus();
  try {
    windowGlobal.getActor(KEYS_ACTOR_NAME).sendAsyncMessage(NW_KEYS_RUN_IN_PAGE_MESSAGE, {
      command,
    });
  } catch (error) {
    // Pages outside the actor's matches (chrome:, about:blank) have no NWKeys actor.
    console.warn("[neoworks-commands] Page command unavailable:", command, error);
  }
}

function pageCommand(id: NWPageCommandId, listed: boolean): NeoworksCommand {
  return { id, listed, run: () => runInSelectedPage(id) };
}

export const PAGE_COMMANDS: NeoworksCommand[] = [
  pageCommand("page:scroll-down", false),
  pageCommand("page:scroll-up", false),
  pageCommand("page:scroll-half-page-down", false),
  pageCommand("page:scroll-half-page-up", false),
  pageCommand("page:scroll-top", true),
  pageCommand("page:scroll-bottom", true),
  pageCommand("hints:open", true),
  pageCommand("hints:open-background", true),
];
