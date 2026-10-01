// SPDX-License-Identifier: MPL-2.0

// The pinned panels in the sidebar, above its footer: one icon each, click to
// open or hide, right-click for more.

import { For, Show } from "solid-js";
import { openContextMenuAt } from "../neoworks-sidebar/context-menu.tsx";
import { panelTitle } from "./panel-browsers.ts";
import { activeId, panels, togglePanel } from "./store.ts";
import type { WebPanel } from "./types.ts";
import { PANEL_MENU_ID, setMenuPanel } from "./panel-menu.tsx";

function pageIcon(url: string): string {
  return `page-icon:${url}`;
}

function initial(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").charAt(0).toUpperCase();
  } catch {
    return "?";
  }
}

function PanelIcon(props: { panel: WebPanel }) {
  let failed = false;
  return (
    <button
      type="button"
      class="nw-icon-button nw-web-panel-icon"
      title={panelTitle(props.panel)}
      data-active={activeId() === props.panel.id ? "true" : undefined}
      onClick={() => togglePanel(props.panel.id)}
      onContextMenu={(event: MouseEvent) => {
        event.stopPropagation();
        setMenuPanel(props.panel);
        openContextMenuAt(PANEL_MENU_ID, event);
      }}
    >
      <span class="nw-web-panel-initial">{initial(props.panel.url)}</span>
      <img
        class="nw-web-panel-favicon"
        src={pageIcon(props.panel.url)}
        alt=""
        onError={(event: Event) => {
          if (!failed) {
            failed = true;
            (event.currentTarget as HTMLElement).hidden = true;
          }
        }}
      />
    </button>
  );
}

export function WebPanelBar() {
  return (
    <Show when={panels().length > 0}>
      <div class="nw-web-panel-bar">
        <For each={panels()}>{(panel) => <PanelIcon panel={panel} />}</For>
      </div>
    </Show>
  );
}
