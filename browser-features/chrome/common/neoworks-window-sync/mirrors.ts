// SPDX-License-Identifier: MPL-2.0

// For features that read a tab's page: with window sync a tab can be a
// mirror, whose own browser is blank while its page is in another window.

import type { WindowSyncModule } from "./types.ts";

function windowSync(): WindowSyncModule {
  return ChromeUtils.importESModule(
    "resource://noraneko/modules/NWWindowSync.sys.mjs",
  ) as WindowSyncModule;
}

export function isMirror(tab: object): boolean {
  return windowSync().isMirror(tab as Element);
}

// The instance of the tab that has its page; read its browser for the URL.
export function contentTab<T extends object>(tab: T): T {
  return windowSync().contentTab(tab as unknown as Element) as unknown as T;
}

// The URL of the tab's page, wherever it is.
export function tabUrl(
  tab: { linkedBrowser: { currentURI: { spec: string } | null } },
): string {
  return contentTab(tab).linkedBrowser.currentURI?.spec ?? "";
}

export function lastAccessedAnywhere(tab: object): number {
  return windowSync().lastAccessedAnywhere(tab as Element);
}
