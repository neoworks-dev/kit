// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import glassStyle from "../neoworks-ui/glass.css?inline";
import iconStyle from "../neoworks-ui/icons.css?inline";
import toolbarStyle from "./toolbar.css?inline";

@noraComponent(import.meta.hot)
export default class NeoworksToolbar extends NoraComponentBase {
  init(): void {
    const style = document.createElement("style");
    style.id = "neoworks-toolbar-style";
    style.textContent = glassStyle + iconStyle + toolbarStyle;
    document.head.append(style);

    onCleanup(() => style.remove());
  }
}
