// SPDX-License-Identifier: MPL-2.0

// Kit's own pane in about:preferences, first in the category list, built on
// the settings framework of Firefox's settings redesign.

import { DEVELOPER_GROUP_ID, registerDeveloperGroup } from "./developer-group.ts";
import { KEY_BINDINGS_GROUP_ID, registerKeyBindingsGroup } from "./key-bindings-group.ts";
import {
  registerSidebarWindowGroup,
  SIDEBAR_WINDOW_GROUP_ID,
} from "./sidebar-window-group.ts";
import { injectKitTheme } from "./theme.ts";
import type { PreferencesWindow } from "./types.ts";
import {
  registerWorkspaceContainersGroup,
  WORKSPACE_CONTAINERS_GROUP_ID,
} from "./workspace-containers-group.ts";

const PANE_ID = "kit";
// SettingPaneManager derives the pane's view name from its id.
const PANE_VIEW = "paneKit";
const PANE_LOADED_TOPIC = "kit-pane-loaded";
const PANE_TITLE = "Kit";
const CATEGORY_ID = "category-kit";
const FIRST_CATEGORY_ID = "category-sync";
// Phosphor "sliders", filled with the nav button's text color.
const CATEGORY_ICON = "data:image/svg+xml," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='context-fill'>" +
    "<path d='M68,102.06V40a12,12,0,0,0-24,0v62.06a36,36,0,0,0,0,67.88V216a12,12,0,0,0,24,0V169.94a36,36,0,0,0,0-67.88ZM56,148a12,12,0,1,1,12-12A12,12,0,0,1,56,148ZM164,88a36.07,36.07,0,0,0-24-33.94V40a12,12,0,0,0-24,0V54.06a36,36,0,0,0,0,67.88V216a12,12,0,0,0,24,0V121.94A36.07,36.07,0,0,0,164,88Zm-36,12a12,12,0,1,1,12-12A12,12,0,0,1,128,100Zm108,68a36.07,36.07,0,0,0-24-33.94V40a12,12,0,0,0-24,0v94.06a36,36,0,0,0,0,67.88V216a12,12,0,0,0,24,0V201.94A36.07,36.07,0,0,0,236,168Zm-36,12a12,12,0,1,1,12-12A12,12,0,0,1,200,180Z'/>" +
    "</svg>",
);

function addKitCategory(doc: Document): void {
  const categories = doc.getElementById("categories");
  if (!categories || doc.getElementById(CATEGORY_ID)) {
    return;
  }
  const button = doc.createElement("moz-page-nav-button");
  button.id = CATEGORY_ID;
  button.setAttribute("view", PANE_VIEW);
  button.setAttribute("iconsrc", CATEGORY_ICON);
  button.textContent = PANE_TITLE;
  categories.insertBefore(button, doc.getElementById(FIRST_CATEGORY_ID));
}

// The pane header only takes a Fluent id; Kit's has none, so the heading is
// set directly once the pane has rendered.
function titleKitPane(doc: Document): void {
  const observer = {
    observe(): void {
      const header = doc.querySelector(
        `setting-pane[data-category="${PANE_VIEW}"] moz-page-header`,
      ) as (HTMLElement & { heading?: string }) | null;
      if (!header) {
        return;
      }
      header.removeAttribute("data-l10n-id");
      header.heading = PANE_TITLE;
    },
  };
  Services.obs.addObserver(observer, PANE_LOADED_TOPIC);
  doc.defaultView?.addEventListener(
    "unload",
    () => Services.obs.removeObserver(observer, PANE_LOADED_TOPIC),
    { once: true },
  );
}

function registerKitPane(win: PreferencesWindow): void {
  registerSidebarWindowGroup(win);
  registerWorkspaceContainersGroup(win);
  registerKeyBindingsGroup(win);
  registerDeveloperGroup(win);
  win.SettingPaneManager.registerPane(PANE_ID, {
    iconSrc: CATEGORY_ICON,
    groupIds: [
      SIDEBAR_WINDOW_GROUP_ID,
      WORKSPACE_CONTAINERS_GROUP_ID,
      KEY_BINDINGS_GROUP_ID,
      DEVELOPER_GROUP_ID,
    ],
  });
}

// The page's init_all() listens for DOMContentLoaded on the document and opens
// the pane named in the URL hash; a capturing listener on the window runs
// first, so about:preferences#kit finds Kit's pane.
export function initKitPreferences(doc: Document): void {
  injectKitTheme(doc);
  const run = (): void => {
    try {
      addKitCategory(doc);
      titleKitPane(doc);
      registerKitPane(doc.defaultView as unknown as PreferencesWindow);
    } catch (error) {
      console.error("[kit-preferences] Adding Kit's settings pane failed:", error);
    }
  };
  if (doc.readyState === "loading") {
    doc.defaultView?.addEventListener("DOMContentLoaded", run, { once: true, capture: true });
    return;
  }
  run();
}
