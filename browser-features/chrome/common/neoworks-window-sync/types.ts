// SPDX-License-Identifier: MPL-2.0

// NWWindowSync.sys.mts, as seen from a window.
export interface WindowSyncModule {
  // Returns a function that stops syncing the window.
  syncWindow(window: Window): () => void;
  // Whether the tab's page is in another window.
  isMirror(tab: Element): boolean;
  // The instance of the tab that has its page: the tab itself unless it's a
  // mirror.
  contentTab<T extends Element>(tab: T): T;
  // When any window's instance of the tab was last selected, in ms.
  lastAccessedAnywhere(tab: Element): number;
}
