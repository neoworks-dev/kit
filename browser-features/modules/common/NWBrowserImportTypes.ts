// SPDX-License-Identifier: MPL-2.0

// Shapes shared by the browser import (NWBrowserImport.sys.mts) and its
// helpers. The setup UI (neoworks-onboarding) codes against these.

export type ImportType = "tabs" | "bookmarks" | "history" | "passwords" | "extensions";

export interface ImportProfile {
  // "" for sources with a single profile.
  id: string;
  name: string;
  types: ImportType[];
}

export interface ImportSource {
  key: string;
  // Plain display name, e.g. "Google Chrome".
  name: string;
  profiles: ImportProfile[];
}

export interface ImportedTab {
  url: string;
  title: string;
  // Pinned in its window or space. False for essentials.
  pinned: boolean;
  // Zen's essentials, kept across spaces.
  essential?: boolean;
  // The Zen space the tab was in.
  workspace?: string;
}

export interface ImportResult {
  type: ImportType;
  ok: boolean;
  // Items imported, when known.
  count?: number;
  // Only for "tabs": the UI opens them, the import doesn't.
  tabs?: ImportedTab[];
  // Short and user-facing.
  error?: string;
}

// The order types are offered and imported in.
export const IMPORT_TYPES: readonly ImportType[] = [
  "tabs",
  "bookmarks",
  "history",
  "passwords",
  "extensions",
];
