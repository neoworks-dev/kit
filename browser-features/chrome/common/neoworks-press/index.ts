// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { watchPresses } from "./press.ts";

@noraComponent(import.meta.hot)
export default class NeoworksPress extends NoraComponentBase {
  init(): void {
    onCleanup(watchPresses());
  }
}
