// SPDX-License-Identifier: MPL-2.0

// The import step's state: which browsers were found, what the user picked
// and how the import went. The work happens in NWBrowserImport.sys.mts;
// imported tabs are opened here, in the window running the setup.

import { createSignal } from "solid-js";
import { NO_CONTAINER } from "../neoworks-sidebar/containers.ts";
import { addToEssentials } from "../neoworks-sidebar/essentials.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import { WORKSPACE_ICONS } from "../neoworks-sidebar/workspace-icons.ts";
import { addWorkspace, moveTabToWorkspace, workspaces } from "../neoworks-sidebar/workspaces.ts";
import type { BrowserTab } from "../neoworks-sidebar/types.ts";
import type {
  BrowserImportModule,
  ImportedTab,
  ImportProfile,
  ImportResult,
  ImportSource,
  ImportType,
} from "./types.ts";

export const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  tabs: "Open tabs",
  bookmarks: "Bookmarks",
  history: "History",
  passwords: "Passwords",
  extensions: "Extensions",
};

// Display order, also the order the imports run in.
const IMPORT_TYPE_ORDER: ImportType[] = ["tabs", "bookmarks", "history", "passwords", "extensions"];

export type ImportPhase = "detecting" | "choosing" | "importing" | "finished";

const [phase, setPhase] = createSignal<ImportPhase>("detecting");
const [sources, setSources] = createSignal<ImportSource[]>([]);
const [sourceKey, setSourceKey] = createSignal<string | null>(null);
const [profileId, setProfileId] = createSignal<string | null>(null);
const [selectedTypes, setSelectedTypes] = createSignal<ImportType[]>([]);
const [results, setResults] = createSignal<ImportResult[]>([]);

export { phase, profileId, results, selectedTypes, sourceKey, sources };

function browserImport(): BrowserImportModule {
  return ChromeUtils.importESModule(
    "resource://noraneko/modules/NWBrowserImport.sys.mjs",
  ) as BrowserImportModule;
}

export function selectedSource(): ImportSource | undefined {
  return sources().find((source) => source.key === sourceKey());
}

export function selectedProfile(): ImportProfile | undefined {
  return selectedSource()?.profiles.find((profile) => profile.id === profileId());
}

export function sortedTypes(types: ImportType[]): ImportType[] {
  return IMPORT_TYPE_ORDER.filter((type) => types.includes(type));
}

export function chooseProfile(source: ImportSource, profile: ImportProfile): void {
  setSourceKey(source.key);
  setProfileId(profile.id);
  setSelectedTypes(sortedTypes(profile.types));
}

export function chooseSource(source: ImportSource): void {
  const profile = source.profiles[0];
  if (profile) {
    chooseProfile(source, profile);
  }
}

export function toggleType(type: ImportType): void {
  setSelectedTypes((types) => {
    if (types.includes(type)) {
      return types.filter((selected) => selected !== type);
    }
    return sortedTypes([...types, type]);
  });
}

// Looked up once per setup run; the first browser found is preselected.
export async function detectSources(): Promise<void> {
  setPhase("detecting");
  setResults([]);
  try {
    const found = await browserImport().importSources();
    setSources(found);
    if (found[0]) {
      chooseSource(found[0]);
    }
  } catch (error) {
    console.error("[neoworks-onboarding] Couldn't look for other browsers:", error);
    setSources([]);
  }
  setPhase("choosing");
}

// A workspace for a named group of imported tabs (a Zen space): the Kit
// workspace with that name, or a new one in no container, like the tabs.
function workspaceNamed(name: string): string {
  const existing = workspaces().find((workspace) =>
    workspace.name.toLowerCase() === name.toLowerCase()
  );
  return (existing ?? addWorkspace(name, WORKSPACE_ICONS[0], NO_CONTAINER)).id;
}

// Essentials that don't fit the grid stay pinned in their workspace.
function placeImportedTab(tab: BrowserTab, imported: ImportedTab): void {
  const browser = tabbrowser();
  if (imported.essential && addToEssentials(tab)) {
    return;
  }
  if (imported.pinned || imported.essential) {
    browser.pinTab(tab);
  }
  if (imported.workspace) {
    moveTabToWorkspace(tab, workspaceNamed(imported.workspace));
  }
}

// Background tabs that load when first selected, so a long session doesn't
// load all at once. Tabs without a workspace join the active one
// (workspaces.ts).
function openImportedTabs(tabs: ImportedTab[]): void {
  const browser = tabbrowser();
  const principal = Services.scriptSecurityManager.getSystemPrincipal();
  for (const imported of tabs) {
    try {
      const tab = browser.addTab(imported.url, {
        createLazyBrowser: true,
        lazyTabTitle: imported.title || imported.url,
        inBackground: true,
        triggeringPrincipal: principal,
      });
      placeImportedTab(tab, imported);
    } catch (error) {
      console.error("[neoworks-onboarding] Couldn't open an imported tab:", imported.url, error);
    }
  }
}

export async function runImport(): Promise<void> {
  const source = selectedSource();
  const profile = selectedProfile();
  const types = selectedTypes();
  if (!source || !profile || types.length === 0) {
    return;
  }
  setPhase("importing");
  setResults([]);
  try {
    await browserImport().importFrom(source.key, profile.id, types, (result) => {
      if (result.tabs) {
        openImportedTabs(result.tabs);
      }
      setResults((done) => [...done, result]);
    });
  } catch (error) {
    console.error("[neoworks-onboarding] Import failed:", error);
  }
  setPhase("finished");
}

export function resultFor(type: ImportType): ImportResult | undefined {
  return results().find((result) => result.type === type);
}
