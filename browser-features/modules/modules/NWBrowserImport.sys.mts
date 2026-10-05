// SPDX-License-Identifier: MPL-2.0

// Imports tabs, bookmarks, history, passwords and extensions from other
// browsers, for Kit's first launch setup (neoworks-onboarding). Chromium
// browsers and Safari go through MigrationUtils' migrators, except tabs,
// which no migrator reads: those come from Chromium's session file
// (NWBrowserImportSNSS.ts). Firefox and its forks are read directly
// (NWBrowserImportGecko.ts). Tabs are only returned; the UI opens them.

import { parseSessionFile } from "../common/NWBrowserImportSNSS.ts";
import {
  geckoProfileDir,
  geckoSources,
  importGeckoType,
  isGeckoSource,
} from "../common/NWBrowserImportGecko.ts";
import {
  IMPORT_TYPES,
  type ImportedTab,
  type ImportProfile,
  type ImportResult,
  type ImportSource,
  type ImportType,
} from "../common/NWBrowserImportTypes.ts";

export type { ImportedTab, ImportProfile, ImportResult, ImportSource, ImportType };

interface MigratorProfile {
  id: string;
  name: string;
}

interface Migrator {
  getSourceProfiles(): Promise<MigratorProfile[] | null> | MigratorProfile[] | null;
  getMigrateData(profile: MigratorProfile | null): Promise<number>;
  hasPermissions(): Promise<boolean>;
  migrate(
    types: number,
    startup: boolean,
    profile: MigratorProfile | null,
    progress: (type: number, success: boolean) => void,
  ): Promise<void>;
  // Only on Chromium migrators.
  _getChromeUserDataPathIfExists?(): Promise<string | null>;
}

type QuantityName = "bookmarks" | "history" | "logins" | "extensions";

interface MigrationUtilsModule {
  availableMigratorKeys: string[];
  getMigrator(key: string): Promise<Migrator | null>;
  resourceTypes: Record<string, number>;
  _importQuantities: Record<QuantityName, number>;
}

interface ExtensionsImport {
  canCompleteOrCancelInstalls: boolean;
  completeInstalls(): Promise<void>;
}

function migrationUtils(): MigrationUtilsModule {
  return (ChromeUtils.importESModule("resource:///modules/MigrationUtils.sys.mjs") as unknown as {
    MigrationUtils: MigrationUtilsModule;
  }).MigrationUtils;
}

// Firefox's own migrators are startup-only and see Kit's profiles; Firefox
// sources come from NWBrowserImportGecko.ts instead.
const SKIPPED_MIGRATORS = new Set(["firefox", "firefox-selectable-profile", "internal-testing"]);

// MigrationUtils only has Fluent ids for these.
const MIGRATOR_NAMES: Record<string, string> = {
  "chrome": "Google Chrome",
  "chrome-beta": "Google Chrome Beta",
  "chrome-dev": "Google Chrome Dev",
  "canary": "Google Chrome Canary",
  "chromium": "Chromium",
  "brave": "Brave",
  "chromium-edge": "Microsoft Edge",
  "chromium-edge-beta": "Microsoft Edge Beta",
  "chromium-360se": "360 Secure Browser",
  "edge": "Microsoft Edge Legacy",
  "opera": "Opera",
  "opera-gx": "Opera GX",
  "vivaldi": "Vivaldi",
  "safari": "Safari",
  "ie": "Internet Explorer",
};

const RESOURCE_TYPES: Partial<Record<ImportType, string>> = {
  bookmarks: "BOOKMARKS",
  history: "HISTORY",
  passwords: "PASSWORDS",
  extensions: "EXTENSIONS",
};

const QUANTITIES: Partial<Record<ImportType, QuantityName>> = {
  bookmarks: "bookmarks",
  history: "history",
  passwords: "logins",
  extensions: "extensions",
};

// --- Chromium tabs ---

// The newest Sessions/Session_<time> file, or "Current Session" from older
// versions.
async function chromiumSessionFile(profileDir: string): Promise<string | null> {
  const sessionsDir = PathUtils.join(profileDir, "Sessions");
  if (await IOUtils.exists(sessionsDir)) {
    const newest = (await IOUtils.getChildren(sessionsDir))
      .filter((path) => /^Session_\d+$/.test(PathUtils.filename(path)))
      .sort((a, b) => {
        const time = (path: string) => BigInt(PathUtils.filename(path).slice("Session_".length));
        return time(a) < time(b) ? 1 : -1;
      })[0];
    if (newest) {
      return newest;
    }
  }
  const legacy = PathUtils.join(profileDir, "Current Session");
  return (await IOUtils.exists(legacy)) ? legacy : null;
}

async function chromiumTabs(migrator: Migrator, profile: MigratorProfile | null): Promise<ImportedTab[]> {
  const dataDir = await migrator._getChromeUserDataPathIfExists?.();
  if (!dataDir || !profile) {
    return [];
  }
  const file = await chromiumSessionFile(PathUtils.join(dataDir, profile.id));
  return file ? parseSessionFile(await IOUtils.read(file)) : [];
}

// --- Chromium favicons ---

interface SqliteRow {
  getResultByName(name: string): unknown;
}
interface SqliteConnection {
  execute(sql: string, params?: Record<string, string>): Promise<SqliteRow[]>;
  close(): Promise<void>;
}

const { Sqlite } = ChromeUtils.importESModule("resource://gre/modules/Sqlite.sys.mjs") as unknown as {
  Sqlite: { openConnection(options: { path: string; readOnly?: boolean }): Promise<SqliteConnection> };
};

// Tab icons are 16px, drawn at up to 2x.
const WANTED_ICON_SIZE = 32;

// favicon_bitmaps always holds PNG.
function imageDataUri(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

// The smallest bitmap at least WANTED_ICON_SIZE wide, else the largest.
function betterIcon(width: number, current: number | undefined): boolean {
  if (current === undefined) {
    return true;
  }
  if (width >= WANTED_ICON_SIZE) {
    return current < WANTED_ICON_SIZE || width < current;
  }
  return current < WANTED_ICON_SIZE && width > current;
}

// Chromium session files have no favicons; its Favicons database maps page
// URLs to them, like Firefox's Chrome bookmark import reads. Works on a copy:
// the browser may be running and holding it.
async function addChromiumTabIcons(profileDir: string, tabs: ImportedTab[]): Promise<void> {
  const source = PathUtils.join(profileDir, "Favicons");
  if (!tabs.length || !(await IOUtils.exists(source))) {
    return;
  }
  const temp = await IOUtils.createUniqueDirectory(PathUtils.tempDir, "kit-browser-import");
  try {
    for (const name of ["Favicons", "Favicons-wal"]) {
      if (await IOUtils.exists(PathUtils.join(profileDir, name))) {
        await IOUtils.copy(PathUtils.join(profileDir, name), PathUtils.join(temp, name));
      }
    }
    const urls = [...new Set(tabs.map((tab) => tab.url))];
    const params: Record<string, string> = {};
    urls.forEach((url, index) => {
      params[`url${index}`] = url;
    });
    const db = await Sqlite.openConnection({ path: PathUtils.join(temp, "Favicons") });
    let rows: SqliteRow[];
    try {
      rows = await db.execute(
        `SELECT map.page_url, bit.width, bit.image_data
         FROM icon_mapping map
         JOIN favicon_bitmaps bit ON bit.icon_id = map.icon_id
         WHERE map.page_url IN (${urls.map((_, index) => `:url${index}`).join(", ")})
           AND length(bit.image_data) > 0`,
        params,
      );
    } finally {
      await db.close();
    }
    const best = new Map<string, { width: number; data: number[] }>();
    for (const row of rows) {
      const url = String(row.getResultByName("page_url"));
      const width = Number(row.getResultByName("width"));
      if (betterIcon(width, best.get(url)?.width)) {
        best.set(url, { width, data: row.getResultByName("image_data") as number[] });
      }
    }
    for (const tab of tabs) {
      const icon = best.get(tab.url);
      if (!icon) {
        continue;
      }
      tab.icon = imageDataUri(new Uint8Array(icon.data));
    }
  } finally {
    await IOUtils.remove(temp, { recursive: true, ignoreAbsent: true });
  }
}

// --- MigrationUtils sources ---

interface MigratorSource {
  migrator: Migrator;
  // null for single-profile sources.
  profiles: MigratorProfile[] | null;
}

async function migratorSource(key: string): Promise<MigratorSource | null> {
  if (SKIPPED_MIGRATORS.has(key)) {
    return null;
  }
  const migrator = await migrationUtils().getMigrator(key);
  // Sources that need a file picker to get at their data are left out.
  if (!migrator || !(await migrator.hasPermissions())) {
    return null;
  }
  return { migrator, profiles: await migrator.getSourceProfiles() };
}

async function migratorProfileTypes(migrator: Migrator, profile: MigratorProfile | null): Promise<ImportType[]> {
  const utils = migrationUtils();
  const available = await migrator.getMigrateData(profile);
  let hasTabs = false;
  try {
    hasTabs = (await chromiumTabs(migrator, profile)).length > 0;
  } catch (error) {
    console.error("[NWBrowserImport] Couldn't read the session of", profile?.id, error);
  }
  return IMPORT_TYPES.filter((type) => {
    if (type === "tabs") {
      return hasTabs;
    }
    const resource = RESOURCE_TYPES[type];
    return resource !== undefined && (available & utils.resourceTypes[resource]) !== 0;
  });
}

async function migratorSources(): Promise<ImportSource[]> {
  const sources: ImportSource[] = [];
  for (const key of migrationUtils().availableMigratorKeys) {
    try {
      const source = await migratorSource(key);
      if (!source) {
        continue;
      }
      const profiles: ImportProfile[] = [];
      for (const profile of source.profiles ?? [null]) {
        const types = await migratorProfileTypes(source.migrator, profile);
        if (types.length) {
          profiles.push({ id: profile?.id ?? "", name: profile?.name ?? MIGRATOR_NAMES[key] ?? key, types });
        }
      }
      if (profiles.length) {
        sources.push({ key, name: MIGRATOR_NAMES[key] ?? key, profiles });
      }
    } catch (error) {
      console.error("[NWBrowserImport] Couldn't check", key, error);
    }
  }
  return sources;
}

async function importMigratorType(
  migrator: Migrator,
  profile: MigratorProfile | null,
  type: ImportType,
): Promise<ImportResult> {
  if (type === "tabs") {
    const tabs = await chromiumTabs(migrator, profile);
    const dataDir = await migrator._getChromeUserDataPathIfExists?.();
    if (dataDir && profile) {
      // Tabs without icons are better than no tabs.
      await addChromiumTabIcons(PathUtils.join(dataDir, profile.id), tabs).catch((error) =>
        console.error("[NWBrowserImport] Couldn't read the favicons of", profile.id, error)
      );
    }
    return { type, ok: true, count: tabs.length, tabs };
  }
  const utils = migrationUtils();
  const resource = RESOURCE_TYPES[type];
  const bit = resource ? utils.resourceTypes[resource] : 0;
  if (!bit || !((await migrator.getMigrateData(profile)) & bit)) {
    return { type, ok: false, error: `No ${type} to import` };
  }
  let success = false;
  // Resolves once every resource of the type has finished.
  await migrator.migrate(bit, false, profile, (_type, ok) => {
    success = ok;
  });
  if (type === "extensions") {
    // Chrome's extensions are staged for the user to confirm; picking them
    // in the setup is that confirmation.
    const { AMBrowserExtensionsImport } = ChromeUtils.importESModule(
      "resource://gre/modules/AddonManager.sys.mjs",
    ) as unknown as { AMBrowserExtensionsImport: ExtensionsImport };
    if (AMBrowserExtensionsImport.canCompleteOrCancelInstalls) {
      await AMBrowserExtensionsImport.completeInstalls();
    }
  }
  const quantity = QUANTITIES[type];
  const count = quantity ? utils._importQuantities[quantity] : undefined;
  if (!success) {
    return {
      type,
      ok: false,
      count,
      error: type === "extensions" ? "Couldn't find these extensions for Kit" : `Couldn't import ${type}`,
    };
  }
  return { type, ok: true, count };
}

// --- API ---

// Installed browsers that have at least one profile with something to import.
export async function importSources(): Promise<ImportSource[]> {
  const [migrators, gecko] = await Promise.all([
    migratorSources(),
    geckoSources().catch((error) => {
      console.error("[NWBrowserImport] Couldn't look for Firefox profiles:", error);
      return [];
    }),
  ]);
  return [...migrators, ...gecko];
}

// Runs the imports in order, calling onProgress after each type finishes. A
// type that fails gets ok: false; the others still run.
export async function importFrom(
  sourceKey: string,
  profileId: string,
  types: ImportType[],
  onProgress?: (result: ImportResult) => void,
): Promise<ImportResult[]> {
  // Resolved once; a type fails on its own if the source is missing.
  let run: (type: ImportType) => Promise<ImportResult>;
  try {
    run = await importer(sourceKey, profileId);
  } catch (error) {
    console.error("[NWBrowserImport] Couldn't open", sourceKey, profileId, error);
    run = (type) => Promise.resolve({ type, ok: false, error: "Couldn't read this browser's data" });
  }

  const results: ImportResult[] = [];
  for (const type of IMPORT_TYPES.filter((type) => types.includes(type))) {
    let result: ImportResult;
    try {
      result = await run(type);
    } catch (error) {
      console.error("[NWBrowserImport] Couldn't import", type, "from", sourceKey, error);
      result = { type, ok: false, error: `Couldn't import ${type}` };
    }
    results.push(result);
    try {
      onProgress?.(result);
    } catch (error) {
      console.error("[NWBrowserImport] Progress callback failed:", error);
    }
  }
  return results;
}

async function importer(sourceKey: string, profileId: string): Promise<(type: ImportType) => Promise<ImportResult>> {
  if (isGeckoSource(sourceKey)) {
    const dir = await geckoProfileDir(sourceKey, profileId);
    if (!dir) {
      throw new Error("Unknown profile");
    }
    return (type) => importGeckoType(dir, type);
  }
  const source = await migratorSource(sourceKey);
  if (!source) {
    throw new Error("Unknown source");
  }
  let profile: MigratorProfile | null = null;
  if (source.profiles) {
    profile = source.profiles.find((candidate) => candidate.id === profileId) ?? null;
    if (!profile) {
      throw new Error("Unknown profile");
    }
  }
  return (type) => importMigratorType(source.migrator, profile, type);
}
