// SPDX-License-Identifier: MPL-2.0

// The AI sidebar (#25, #51): a chat with Claude Code, Codex or pi, run
// through Kit's harness sidecar. Off in private windows.

import { onCleanup } from "solid-js";
import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { registerCommands } from "../neoworks-commands/registry.ts";
import { disconnect } from "./chat.ts";
import { mountAiPanel, mountControlIndicator } from "./mount.tsx";
import { insertAiButton, toggleAiPanel } from "./panel.ts";
import layoutStyle from "./layout.css?inline";

const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
) as { PrivateBrowsingUtils: { isWindowPrivate(window: Window): boolean } };

@noraComponent(import.meta.hot)
export default class NeoworksAi extends NoraComponentBase {
  init(): void {
    if (PrivateBrowsingUtils.isWindowPrivate(window)) {
      return;
    }
    const browserBox = document.getElementById("browser");
    if (!browserBox) {
      console.error("[neoworks-ai] #browser is unavailable at init.");
      return;
    }

    const style = document.createElement("style");
    style.id = "neoworks-ai-style";
    style.textContent = layoutStyle;
    document.head.append(style);
    onCleanup(() => style.remove());

    mountAiPanel(browserBox);
    mountControlIndicator(browserBox);
    onCleanup(insertAiButton());
    onCleanup(registerCommands([{ id: "ai:toggle", listed: true, run: toggleAiPanel }]));
    onCleanup(disconnect);
  }
}
