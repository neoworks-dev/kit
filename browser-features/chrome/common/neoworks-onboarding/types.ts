// SPDX-License-Identifier: MPL-2.0

// The import API of NWBrowserImport.sys.mts, as the setup sees it.

export type ImportType = "tabs" | "bookmarks" | "history" | "passwords" | "extensions";

export interface ImportProfile {
  // "" for browsers with a single profile.
  id: string;
  name: string;
  types: ImportType[];
}

export interface ImportSource {
  key: string;
  name: string;
  profiles: ImportProfile[];
}

export interface ImportedTab {
  url: string;
  title: string;
  pinned: boolean;
  // Zen's Essentials, which Kit has too.
  essential?: boolean;
  // Name of the workspace (Zen space) the tab was in.
  workspace?: string;
  // That space's icon: an emoji, or the name of one of Zen's icons.
  workspaceIcon?: string;
  // The tab's favicon as a data: URI.
  icon?: string;
}

export interface ImportResult {
  type: ImportType;
  ok: boolean;
  count?: number;
  // Only for "tabs": the setup opens them.
  tabs?: ImportedTab[];
  error?: string;
}

export interface BrowserImportModule {
  importSources(): Promise<ImportSource[]>;
  importFrom(
    sourceKey: string,
    profileId: string,
    types: ImportType[],
    onProgress?: (result: ImportResult) => void,
  ): Promise<ImportResult[]>;
}

export type OnboardingStep = "welcome" | "import" | "theme" | "settings" | "done";

export interface ThemeChoice {
  id: string;
  label: string;
  description: string;
  // Drawn in the preview; System shows both.
  schemes: ("light" | "dark")[];
}

export interface SettingOption<T> {
  value: T;
  label: string;
}

// "failed": the system didn't take the request (e.g. Kit isn't installed).
export type DefaultBrowserState = "unknown" | "not-default" | "setting" | "default" | "failed";
