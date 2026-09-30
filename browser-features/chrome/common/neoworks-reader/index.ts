// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { registerCommands } from "../neoworks-commands/registry.ts";
import { applyReaderStyle, toggleReaderView } from "./reader.ts";

@noraComponent(import.meta.hot)
export default class NeoworksReader extends NoraComponentBase {
  init(): void {
    try {
      applyReaderStyle();
    } catch (error) {
      console.error("[neoworks-reader] Reader view styling is unavailable:", error);
    }
    onCleanup(registerCommands([{ id: "page:reader", listed: true, run: toggleReaderView }]));
  }
}
