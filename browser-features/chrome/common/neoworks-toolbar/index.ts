// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { registerCommands } from "../neoworks-commands/registry.ts";
import { mountPageActionsMenu } from "./mount.tsx";
import { insertPageActionsButton, pageActionsButton } from "./page-actions-button.ts";
import { openPageActions, togglePageActions } from "./page-actions-menu.tsx";
import { watchGlassTint } from "./glass-tint.ts";
import { toggleWindowTransparency, watchWindowTransparency } from "./window-transparency.ts";
import frameStyle from "../neoworks-ui/frame.css?inline";
import glassStyle from "../neoworks-ui/glass.css?inline";
import iconStyle from "../neoworks-ui/icons.css?inline";
import menuStyle from "../neoworks-ui/menu.css?inline";
import toolbarStyle from "./toolbar.css?inline";

function openPageActionsFromCommand(): void {
  const button = pageActionsButton();
  if (!button) {
    return;
  }
  openPageActions(button);
}

@noraComponent(import.meta.hot)
export default class NeoworksToolbar extends NoraComponentBase {
  init(): void {
    const style = document.createElement("style");
    style.id = "neoworks-toolbar-style";
    style.textContent = frameStyle + glassStyle + iconStyle + menuStyle + toolbarStyle;
    document.head.append(style);
    onCleanup(() => style.remove());
    onCleanup(watchWindowTransparency());
    onCleanup(watchGlassTint());

    if (!document.body) {
      console.error("[neoworks-toolbar] Browser chrome is unavailable at init.");
      return;
    }
    mountPageActionsMenu(document.body);
    onCleanup(insertPageActionsButton(togglePageActions));

    const unregister = registerCommands([
      { id: "page-actions:open", listed: true, run: openPageActionsFromCommand },
      { id: "window:toggle-transparent", listed: true, run: toggleWindowTransparency },
    ]);
    onCleanup(unregister);
  }
}
