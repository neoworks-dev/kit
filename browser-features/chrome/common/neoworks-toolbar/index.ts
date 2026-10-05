// SPDX-License-Identifier: MPL-2.0

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { registerCommands } from "../neoworks-commands/registry.ts";
import { copyPageLink, listenForCopyLinkShortcut } from "./copy-link.ts";
import { mountPageActionsMenu, mountToast } from "./mount.tsx";
import { insertModeBadge } from "./mode-badge.ts";
import { insertPageActionsButton, pageActionsButton } from "./page-actions-button.ts";
import { openPageActions, togglePageActions } from "./page-actions-menu.tsx";
import { watchGlassTint } from "./glass-tint.ts";
import { hideToast } from "./toast.tsx";
import { watchWindowControls } from "./window-controls.ts";
import { toggleWindowTransparency, watchWindowTransparency } from "./window-transparency.ts";
import frameStyle from "../neoworks-ui/frame.css?inline";
import glassStyle from "../neoworks-ui/glass.css?inline";
import iconStyle from "../neoworks-ui/icons.css?inline";
import menuStyle from "../neoworks-ui/menu.css?inline";
import bookmarksStyle from "./bookmarks.css?inline";
import toastStyle from "./toast.css?inline";
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
    style.textContent = frameStyle + glassStyle + iconStyle + menuStyle + toolbarStyle + bookmarksStyle +
      toastStyle;
    document.head.append(style);
    onCleanup(() => style.remove());
    onCleanup(watchWindowTransparency());
    onCleanup(watchGlassTint());
    onCleanup(watchWindowControls());

    if (!document.body) {
      console.error("[neoworks-toolbar] Browser chrome is unavailable at init.");
      return;
    }
    mountPageActionsMenu(document.body);
    mountToast(document.body);
    onCleanup(hideToast);
    onCleanup(listenForCopyLinkShortcut());
    onCleanup(insertPageActionsButton(togglePageActions));
    onCleanup(insertModeBadge());

    const unregister = registerCommands([
      { id: "page-actions:open", listed: true, run: openPageActionsFromCommand },
      { id: "window:toggle-transparent", listed: true, run: toggleWindowTransparency },
      { id: "page:copy-url", listed: true, run: copyPageLink },
    ]);
    onCleanup(unregister);
  }
}
