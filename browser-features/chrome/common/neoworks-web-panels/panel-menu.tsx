// SPDX-License-Identifier: MPL-2.0

// Right-click menu of a panel icon in the sidebar.

import { createSignal } from "solid-js";
import { setSidebarMenuOpen } from "../neoworks-sidebar/sidebar-visibility.ts";
import { openPanelAsTab, unpinPanel } from "./actions.ts";
import { reloadPanel } from "./panel-browsers.ts";
import { showPanel } from "./store.ts";
import type { WebPanel } from "./types.ts";

export const PANEL_MENU_ID = "neoworks-web-panel-menu";

const [menuPanel, setMenuPanel] = createSignal<WebPanel | null>(null);

export { setMenuPanel };

function withPanel(run: (panel: WebPanel) => void): () => void {
  return () => {
    const panel = menuPanel();
    if (panel) {
      run(panel);
    }
  };
}

export function WebPanelMenu() {
  return (
    <xul:menupopup
      id={PANEL_MENU_ID}
      onPopupShowing={(event: Event) => {
        if (event.target === event.currentTarget) {
          setSidebarMenuOpen(PANEL_MENU_ID, true);
        }
      }}
      onPopupHiding={(event: Event) => {
        if (event.target === event.currentTarget) {
          setSidebarMenuOpen(PANEL_MENU_ID, false);
        }
      }}
    >
      <xul:menuitem
        label="Back to pinned page"
        onCommand={withPanel((panel) => {
          showPanel(panel.id);
          reloadPanel(panel);
        })}
      />
      <xul:menuitem label="Open as tab" onCommand={withPanel(openPanelAsTab)} />
      <xul:menuseparator />
      <xul:menuitem label="Unpin panel" onCommand={withPanel(unpinPanel)} />
    </xul:menupopup>
  );
}
