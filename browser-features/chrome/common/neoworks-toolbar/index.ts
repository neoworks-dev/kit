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
import { startToolbarBackdrop } from "./toolbar-backdrop.ts";
import glassStyle from "../neoworks-ui/glass.css?inline";
import iconStyle from "../neoworks-ui/icons.css?inline";
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
    style.textContent = glassStyle + iconStyle + toolbarStyle;
    document.head.append(style);
    onCleanup(() => style.remove());
    onCleanup(startToolbarBackdrop());

    if (!document.body) {
      console.error("[neoworks-toolbar] Browser chrome is unavailable at init.");
      return;
    }
    mountPageActionsMenu(document.body);
    onCleanup(insertPageActionsButton(togglePageActions));

    const unregister = registerCommands([
      {
        id: "page-actions:open",
        title: "Page Actions",
        listed: true,
        run: openPageActionsFromCommand,
      },
    ]);
    onCleanup(unregister);
  }
}
