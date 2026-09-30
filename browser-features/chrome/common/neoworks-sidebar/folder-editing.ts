// SPDX-License-Identifier: MPL-2.0

// The folder whose name and color are being edited in place. At most one at a
// time; the sidebar stays open meanwhile.

import { createSignal } from "solid-js";
import { focusInputSoon } from "./focus-input.ts";
import { setSidebarMenuOpen } from "./sidebar-visibility.ts";
import type { BrowserTabGroup } from "./types.ts";

const EDITOR_NAME = "folder-editor";
export const FOLDER_NAME_INPUT_ID = "neoworks-folder-name-input";

const [editedFolder, setEditedFolder] = createSignal<BrowserTabGroup | null>(null);

export { editedFolder };

export function startFolderEdit(group: BrowserTabGroup): void {
  setEditedFolder(group);
  setSidebarMenuOpen(EDITOR_NAME, true);
  focusInputSoon(FOLDER_NAME_INPUT_ID);
}

export function stopFolderEdit(): void {
  setEditedFolder(null);
  setSidebarMenuOpen(EDITOR_NAME, false);
}
