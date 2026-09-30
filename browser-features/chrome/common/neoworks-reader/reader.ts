// SPDX-License-Identifier: MPL-2.0

// Reader view is Firefox's (AboutReader actors); Kit adds a command for it and
// its own stylesheet.

import { readPageState } from "../neoworks-toolbar/page-actions.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import readerStyle from "./reader.css?raw";
import type { ReaderStyleModule } from "./types.ts";

const READER_ACTOR_NAME = "AboutReader";
const TOGGLE_MESSAGE = "Reader:ToggleReaderMode";

// What the reader button sends. Firefox only offers reader view once
// Readability judged the page an article; forcing it elsewhere shows an error
// page, so the command follows the same rule.
export function toggleReaderView(): void {
  if (!readPageState().readerAvailable) {
    return;
  }
  const windowGlobal = tabbrowser().selectedBrowser.browsingContext?.currentWindowGlobal;
  try {
    windowGlobal?.getActor(READER_ACTOR_NAME).sendAsyncMessage(TOGGLE_MESSAGE, {});
  } catch (error) {
    console.error("[neoworks-reader] Couldn't toggle reader view:", error);
  }
}

export function applyReaderStyle(): void {
  const { setReaderStyle } = ChromeUtils.importESModule(
    "resource://noraneko/modules/NWReaderStyle.sys.mjs",
  ) as ReaderStyleModule;
  setReaderStyle(readerStyle);
}
