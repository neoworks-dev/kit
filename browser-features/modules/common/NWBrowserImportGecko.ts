// SPDX-License-Identifier: MPL-2.0

// Imports from Firefox and browsers built on it (Zen, LibreWolf, Waterfox,
// Floorp), for NWBrowserImport.sys.mts. MigrationUtils' own Firefox migrators
// only work at startup or for a profile refresh and list Kit's own profiles,
// so this reads the other browser's profile folders directly. Passwords
// aren't offered: they would need key4.db decrypted.

import { isImportableTabUrl } from "./NWBrowserImportSNSS.ts";
import type { ImportedTab, ImportProfile, ImportResult, ImportType } from "./NWBrowserImportTypes.ts";

type Platform = "linux" | "macosx" | "win";

interface GeckoBrowser {
  key: string;
  name: string;
  // Folders holding profiles.ini. On Linux relative to the home folder
  // ("$XDG/" for XDG_CONFIG_HOME), on macOS to ~/Library/Application
  // Support, on Windows to %APPDATA%.
  roots: Record<Platform, string[]>;
}

const GECKO_BROWSERS: GeckoBrowser[] = [
  {
    key: "firefox",
    name: "Firefox",
    roots: {
      linux: [
        ".mozilla/firefox",
        "$XDG/mozilla/firefox",
        "snap/firefox/common/.mozilla/firefox",
        ".var/app/org.mozilla.firefox/.mozilla/firefox",
      ],
      macosx: ["Firefox"],
      win: ["Mozilla/Firefox"],
    },
  },
  {
    key: "zen",
    name: "Zen",
    roots: {
      linux: [".zen", "$XDG/zen", ".var/app/app.zen_browser.zen/.zen"],
      macosx: ["zen"],
      win: ["zen"],
    },
  },
  {
    key: "librewolf",
    name: "LibreWolf",
    roots: {
      linux: [".librewolf", ".var/app/io.gitlab.librewolf-community/.librewolf"],
      macosx: ["librewolf"],
      win: ["librewolf"],
    },
  },
  {
    key: "waterfox",
    name: "Waterfox",
    roots: { linux: [".waterfox"], macosx: ["Waterfox"], win: ["Waterfox"] },
  },
  {
    key: "floorp",
    name: "Floorp",
    roots: {
      linux: [".floorp", ".var/app/one.ablaze.floorp/.floorp"],
      macosx: ["Floorp"],
      win: ["Floorp"],
    },
  },
];

// Minimal views of the Gecko modules used here.
interface SqliteRow {
  getResultByName(name: string): unknown;
}
interface SqliteConnection {
  execute(sql: string, params?: Record<string, string | number>): Promise<SqliteRow[]>;
  close(): Promise<void>;
}
interface BookmarkItem {
  type?: number;
  url?: string;
  title?: string;
  dateAdded?: Date;
  children?: BookmarkItem[];
}
interface PageInfo {
  url: URL;
  title: string;
  visits: { date: Date; transition: number }[];
}
interface PlacesUtilsModule {
  bookmarks: {
    TYPE_FOLDER: number;
    TYPE_SEPARATOR: number;
    toolbarGuid: string;
    menuGuid: string;
    unfiledGuid: string;
    insertTree(tree: { guid: string; children: BookmarkItem[] }): Promise<unknown[]>;
  };
  history: { TRANSITIONS: { LINK: number; TYPED: number } };
}
interface MigrationUtilsModule {
  HISTORY_MAX_AGE_IN_MILLISECONDS: number;
  insertVisitsWrapper(pageInfos: PageInfo[]): Promise<unknown>;
}
interface AddonInstallLike {
  install(): Promise<unknown>;
}
interface AddonManagerModule {
  getAddonByID(id: string): Promise<unknown>;
  getInstallForURL(
    url: string,
    options: { hash?: string; telemetryInfo: { source: string }; promptHandler: () => void },
  ): Promise<AddonInstallLike>;
}

function sqlite(): { openConnection(options: { path: string }): Promise<SqliteConnection> } {
  return (ChromeUtils.importESModule("resource://gre/modules/Sqlite.sys.mjs") as unknown as {
    Sqlite: { openConnection(options: { path: string }): Promise<SqliteConnection> };
  }).Sqlite;
}

function placesUtils(): PlacesUtilsModule {
  return (ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs") as unknown as {
    PlacesUtils: PlacesUtilsModule;
  }).PlacesUtils;
}

function migrationUtils(): MigrationUtilsModule {
  return (ChromeUtils.importESModule("resource:///modules/MigrationUtils.sys.mjs") as unknown as {
    MigrationUtils: MigrationUtilsModule;
  }).MigrationUtils;
}

function addonManager(): AddonManagerModule {
  return (ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs") as unknown as {
    AddonManager: AddonManagerModule;
  }).AddonManager;
}

function platform(): Platform | null {
  switch (Services.appinfo.OS) {
    case "Linux":
      return "linux";
    case "Darwin":
      return "macosx";
    case "WINNT":
      return "win";
    default:
      return null;
  }
}

function specialDir(key: string): string | null {
  try {
    return Services.dirsvc.get(key, Ci.nsIFile).path;
  } catch {
    return null;
  }
}

function samePath(a: string, b: string): boolean {
  // Paths from profiles.ini and the directory service, which don't all exist,
  // so no PathUtils.normalize (it needs the file).
  const normalize = (path: string) => {
    const normal = path.replaceAll("\\", "/").replace(/\/+$/, "");
    return platform() === "linux" ? normal : normal.toLowerCase();
  };
  return normalize(a) === normalize(b);
}

function joinRelative(base: string, relative: string): string {
  return PathUtils.join(base, ...relative.split("/").filter(Boolean));
}

function rootPaths(browser: GeckoBrowser): string[] {
  const os = platform();
  const home = specialDir("Home");
  if (!os || !home) {
    return [];
  }
  let base = home;
  if (os === "macosx") {
    base = PathUtils.join(home, "Library", "Application Support");
  } else if (os === "win") {
    base = specialDir("AppData") ?? PathUtils.join(home, "AppData", "Roaming");
  }
  const xdg = Services.env.get("XDG_CONFIG_HOME") || PathUtils.join(home, ".config");
  return browser.roots[os].map((root) =>
    root.startsWith("$XDG/") ? joinRelative(xdg, root.slice(5)) : joinRelative(base, root)
  );
}

function parseIni(text: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>();
  let current: Map<string, string> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      current = new Map();
      sections.set(header[1], current);
    } else if (current) {
      const equals = line.indexOf("=");
      if (equals > 0) {
        current.set(line.slice(0, equals).trim(), line.slice(equals + 1).trim());
      }
    }
  }
  return sections;
}

interface GeckoProfile {
  dir: string;
  name: string;
  // The one the browser opens by default.
  isDefault: boolean;
  // ms since the epoch.
  lastUsed: number;
}

// Kit's own profiles never count as another browser.
function isKitProfile(dir: string, root: string): boolean {
  const kitRoot = specialDir("DefProfRt");
  return samePath(dir, PathUtils.profileDir) || (kitRoot !== null && samePath(root, kitRoot));
}

async function lastUsed(dir: string): Promise<number> {
  let newest = 0;
  for (const name of ["places.sqlite", "places.sqlite-wal", ...SESSION_FILES]) {
    try {
      newest = Math.max(newest, (await IOUtils.stat(joinRelative(dir, name))).lastModified ?? 0);
    } catch {
      // Not there.
    }
  }
  return newest;
}

function profileDir(root: string, path: string, relative: boolean): string {
  return relative ? joinRelative(root, path) : path;
}

// Profiles from every root that exists, default profiles first. Folders come
// from profiles.ini only; scanning the roots would also find other apps'
// files (XDG roots are shared).
async function listProfiles(browser: GeckoBrowser): Promise<GeckoProfile[]> {
  const profiles: GeckoProfile[] = [];
  const seenRoots: string[] = [];
  for (const root of rootPaths(browser)) {
    if (seenRoots.some((seen) => samePath(seen, root))) {
      continue;
    }
    seenRoots.push(root);
    const iniPath = PathUtils.join(root, "profiles.ini");
    let sections: Map<string, Map<string, string>>;
    try {
      if (!(await IOUtils.exists(iniPath))) {
        continue;
      }
      sections = parseIni(await IOUtils.readUTF8(iniPath));
    } catch (error) {
      console.error("[NWBrowserImport] Couldn't read profiles.ini:", iniPath, error);
      continue;
    }
    // [Install<hash>] Default= is the default of newer versions,
    // [Profile<n>] Default=1 that of older ones.
    const defaults: string[] = [];
    for (const [section, values] of sections) {
      const path = values.get("Default");
      if (section.startsWith("Install") && path) {
        defaults.push(profileDir(root, path, !PathUtils.isAbsolute(path)));
      }
    }
    for (const [section, values] of sections) {
      const path = values.get("Path");
      if (!/^Profile\d+$/.test(section) || !path) {
        continue;
      }
      const dir = profileDir(root, path, values.get("IsRelative") === "1");
      if (
        isKitProfile(dir, root) || profiles.some((profile) => samePath(profile.dir, dir)) ||
        !(await IOUtils.exists(dir))
      ) {
        continue;
      }
      profiles.push({
        dir,
        name: values.get("Name") || PathUtils.filename(dir),
        isDefault: defaults.length ? defaults.some((other) => samePath(other, dir)) : values.get("Default") === "1",
        lastUsed: await lastUsed(dir),
      });
    }
  }
  // Two roots can both have a "default-release".
  for (const profile of profiles) {
    if (profiles.filter((other) => other.name === profile.name).length > 1) {
      profile.name = `${profile.name} (${PathUtils.filename(profile.dir)})`;
    }
  }
  // Each root has a default; the one used last goes first.
  return profiles.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.lastUsed - a.lastUsed);
}

// --- Tabs ---

interface SessionEntry {
  url?: string;
  title?: string;
}
interface SessionTab {
  entries?: SessionEntry[];
  index?: number;
  pinned?: boolean;
  // Zen's additions.
  zenEssential?: boolean;
  zenWorkspace?: string;
  zenSyncId?: string;
  zenIsEmpty?: boolean;
  zenIsGlance?: boolean;
}
interface ZenSpace {
  uuid?: string;
  name?: string;
}
// Firefox's sessionstore has windows; Zen's own zen-sessions.jsonlz4 has
// the tabs and spaces at the top level.
interface SessionState {
  windows?: { tabs?: SessionTab[]; spaces?: ZenSpace[] }[];
  tabs?: SessionTab[];
  spaces?: ZenSpace[];
}

const SESSION_FILES = [
  "zen-sessions.jsonlz4",
  "sessionstore.jsonlz4",
  "sessionstore-backups/recovery.jsonlz4",
  "sessionstore-backups/previous.jsonlz4",
];

// The session files that exist, newest first: the recovery file is the live
// one while the browser runs, sessionstore.jsonlz4 is written at a clean
// shutdown and Zen keeps its own.
async function sessionFiles(dir: string): Promise<string[]> {
  const found: { path: string; time: number }[] = [];
  for (const name of SESSION_FILES) {
    const path = joinRelative(dir, name);
    try {
      found.push({ path, time: (await IOUtils.stat(path)).lastModified ?? 0 });
    } catch {
      // Not there.
    }
  }
  return found.sort((a, b) => b.time - a.time).map((file) => file.path);
}

function sessionTabs(state: SessionState): ImportedTab[] | null {
  const groups = state.windows ?? (state.tabs ? [{ tabs: state.tabs, spaces: state.spaces }] : null);
  if (!Array.isArray(groups)) {
    return null;
  }
  const tabs: ImportedTab[] = [];
  // Zen repeats synced tabs in every window.
  const synced = new Set<string>();
  for (const group of groups) {
    const spaces = new Map<string, string>();
    for (const space of group.spaces ?? state.spaces ?? []) {
      if (space.uuid && space.name) {
        spaces.set(space.uuid, space.name);
      }
    }
    for (const tab of group.tabs ?? []) {
      if (tab.zenIsEmpty || tab.zenIsGlance) {
        continue;
      }
      if (tab.zenSyncId) {
        if (synced.has(tab.zenSyncId)) {
          continue;
        }
        synced.add(tab.zenSyncId);
      }
      const entries = tab.entries ?? [];
      // index is 1-based.
      const entry = entries[Math.min(Math.max((tab.index ?? entries.length) - 1, 0), entries.length - 1)];
      if (!entry?.url || !isImportableTabUrl(entry.url)) {
        continue;
      }
      const imported: ImportedTab = { url: entry.url, title: entry.title ?? "", pinned: tab.pinned === true };
      if (tab.zenEssential) {
        // Essentials show in every space.
        imported.pinned = false;
        imported.essential = true;
      } else if (tab.zenWorkspace && spaces.has(tab.zenWorkspace)) {
        imported.workspace = spaces.get(tab.zenWorkspace);
      }
      tabs.push(imported);
    }
  }
  return tabs;
}

// From the newest session file that reads; a browser killed mid-write can
// leave a broken one behind.
async function readTabs(dir: string): Promise<ImportedTab[]> {
  for (const path of await sessionFiles(dir)) {
    try {
      const tabs = sessionTabs(await IOUtils.readJSON(path, { decompress: true }) as SessionState);
      if (tabs) {
        return tabs;
      }
    } catch (error) {
      console.error("[NWBrowserImport] Couldn't read the session file", path, error);
    }
  }
  return [];
}

// --- Bookmarks and history ---

// Works on a copy of places.sqlite: the browser may be running and holding
// it. The copy is opened read-write so SQLite can apply the copied WAL.
async function withPlaces<T>(dir: string, read: (db: SqliteConnection) => Promise<T>): Promise<T> {
  const temp = await IOUtils.createUniqueDirectory(PathUtils.tempDir, "kit-browser-import");
  try {
    for (const name of ["places.sqlite", "places.sqlite-wal"]) {
      const source = PathUtils.join(dir, name);
      if (await IOUtils.exists(source)) {
        await IOUtils.copy(source, PathUtils.join(temp, name));
      }
    }
    const db = await sqlite().openConnection({ path: PathUtils.join(temp, "places.sqlite") });
    try {
      return await read(db);
    } finally {
      await db.close();
    }
  } finally {
    await IOUtils.remove(temp, { recursive: true, ignoreAbsent: true });
  }
}

const TYPE_BOOKMARK = 1;
const TYPE_FOLDER = 2;
const TYPE_SEPARATOR = 3;

interface BookmarkRow {
  id: number;
  type: number;
  title: string;
  dateAdded: number;
  guid: string;
  url: string | null;
}

function toBookmarkItems(
  parentId: number,
  children: Map<number, BookmarkRow[]>,
  places: PlacesUtilsModule,
  depth = 0,
): BookmarkItem[] {
  // Deep enough for any real tree, and stops a corrupt one that loops.
  if (depth > 64) {
    return [];
  }
  const now = Date.now();
  const items: BookmarkItem[] = [];
  for (const row of children.get(parentId) ?? []) {
    // PRTime, in microseconds.
    const added = row.dateAdded / 1000;
    const dateAdded = added > 0 && added <= now ? new Date(added) : undefined;
    if (row.type === TYPE_BOOKMARK) {
      // place: URLs are saved searches, mostly the defaults every profile has.
      if (!row.url || row.url.startsWith("place:") || !URL.canParse(row.url)) {
        continue;
      }
      items.push({ url: row.url, title: row.title, dateAdded });
    } else if (row.type === TYPE_FOLDER) {
      items.push({
        type: places.bookmarks.TYPE_FOLDER,
        title: row.title,
        dateAdded,
        children: toBookmarkItems(row.id, children, places, depth + 1),
      });
    } else if (row.type === TYPE_SEPARATOR) {
      items.push({ type: places.bookmarks.TYPE_SEPARATOR });
    }
  }
  return items;
}

async function importBookmarks(dir: string): Promise<number> {
  const rows = await withPlaces(dir, (db) =>
    db.execute(
      `SELECT b.id, b.parent, b.type, b.title, b.dateAdded, b.guid, p.url
       FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk
       ORDER BY b.parent, b.position`,
    ));
  const children = new Map<number, BookmarkRow[]>();
  const roots = new Map<string, number>();
  for (const row of rows) {
    const bookmark: BookmarkRow = {
      id: Number(row.getResultByName("id")),
      type: Number(row.getResultByName("type")),
      title: String(row.getResultByName("title") ?? ""),
      dateAdded: Number(row.getResultByName("dateAdded") ?? 0),
      guid: String(row.getResultByName("guid") ?? ""),
      url: row.getResultByName("url") as string | null,
    };
    const parent = Number(row.getResultByName("parent"));
    children.set(parent, [...(children.get(parent) ?? []), bookmark]);
    roots.set(bookmark.guid, bookmark.id);
  }

  const places = placesUtils();
  // Each root goes where it was; mobile bookmarks have no place on desktop.
  const targets: [string, string][] = [
    ["toolbar_____", places.bookmarks.toolbarGuid],
    ["menu________", places.bookmarks.menuGuid],
    ["unfiled_____", places.bookmarks.unfiledGuid],
    ["mobile______", places.bookmarks.unfiledGuid],
  ];
  let count = 0;
  for (const [sourceGuid, targetGuid] of targets) {
    const rootId = roots.get(sourceGuid);
    if (rootId === undefined) {
      continue;
    }
    const items = toBookmarkItems(rootId, children, places);
    if (items.length) {
      count += (await places.bookmarks.insertTree({ guid: targetGuid, children: items })).length;
    }
  }
  return count;
}

async function importHistory(dir: string): Promise<number> {
  const migration = migrationUtils();
  // The same caps as the Chrome import: recent pages only, and not too many.
  const limit = Services.prefs.getIntPref("browser.migrate.chrome.history.limit", 2000);
  const since = (Date.now() - migration.HISTORY_MAX_AGE_IN_MILLISECONDS) * 1000;
  // substr, not LIKE: Sqlite.sys.mjs refuses LIKE with a literal pattern.
  const rows = await withPlaces(dir, (db) =>
    db.execute(
      `SELECT url, title, last_visit_date, typed FROM moz_places
       WHERE hidden = 0 AND last_visit_date > :since
         AND (substr(url, 1, 5) = 'http:' OR substr(url, 1, 6) = 'https:')
       ORDER BY last_visit_date DESC LIMIT :limit`,
      { since, limit: limit > 0 ? limit : -1 },
    ));
  const { TRANSITIONS } = placesUtils().history;
  const pageInfos: PageInfo[] = [];
  for (const row of rows) {
    try {
      pageInfos.push({
        url: new URL(String(row.getResultByName("url"))),
        title: String(row.getResultByName("title") ?? ""),
        visits: [{
          date: new Date(Number(row.getResultByName("last_visit_date")) / 1000),
          transition: Number(row.getResultByName("typed")) > 0 ? TRANSITIONS.TYPED : TRANSITIONS.LINK,
        }],
      });
    } catch {
      // An URL that doesn't parse; skip it.
    }
  }
  if (pageInfos.length) {
    await migration.insertVisitsWrapper(pageInfos);
  }
  return pageInfos.length;
}

// --- Extensions ---

interface AddonEntry {
  id?: string;
  type?: string;
  active?: boolean;
  location?: string;
  isSystem?: boolean;
  isBuiltin?: boolean;
}

// Extensions the user installed and has turned on.
async function profileExtensions(dir: string): Promise<string[]> {
  const path = PathUtils.join(dir, "extensions.json");
  if (!(await IOUtils.exists(path))) {
    return [];
  }
  const data = await IOUtils.readJSON(path) as { addons?: AddonEntry[] };
  return (data.addons ?? [])
    .filter((addon) =>
      addon.type === "extension" && addon.active === true && addon.location === "app-profile" &&
      !addon.isSystem && !addon.isBuiltin && typeof addon.id === "string"
    )
    .map((addon) => addon.id as string);
}

interface AmoAddon {
  current_version?: { file?: { url?: string; hash?: string } };
}

// The download of the current version on addons.mozilla.org, or null for
// extensions that aren't listed there.
export async function amoDownload(id: string): Promise<{ url: string; hash?: string } | null> {
  const response = await fetch(
    `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(id)}/`,
  );
  if (!response.ok) {
    return null;
  }
  const file = ((await response.json()) as AmoAddon).current_version?.file;
  return file?.url ? { url: file.url, hash: file.hash } : null;
}

// Installs them from addons.mozilla.org, skipping ones Kit already has.
async function importExtensions(dir: string): Promise<{ installed: number; present: number; missed: number }> {
  const manager = addonManager();
  const results = await Promise.allSettled(
    (await profileExtensions(dir)).map(async (id) => {
      if (await manager.getAddonByID(id)) {
        return "present";
      }
      const download = await amoDownload(id);
      if (!download) {
        return "missed";
      }
      const install = await manager.getInstallForURL(download.url, {
        hash: download.hash,
        telemetryInfo: { source: "browser-import" },
        // No permission prompts: the user picked these in the setup.
        promptHandler: () => {},
      });
      await install.install();
      return "installed";
    }),
  );
  let installed = 0;
  let present = 0;
  let missed = 0;
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[NWBrowserImport] Couldn't install an extension:", result.reason);
      missed++;
    } else if (result.value === "installed") {
      installed++;
    } else if (result.value === "missed") {
      missed++;
    } else {
      present++;
    }
  }
  return { installed, present, missed };
}

// --- Sources ---

export interface GeckoSource {
  key: string;
  name: string;
  profiles: ImportProfile[];
}

async function profileTypes(dir: string): Promise<ImportType[]> {
  const types: ImportType[] = [];
  try {
    if ((await readTabs(dir)).length) {
      types.push("tabs");
    }
  } catch (error) {
    console.error("[NWBrowserImport] Couldn't read the session of", dir, error);
  }
  if (await IOUtils.exists(PathUtils.join(dir, "places.sqlite"))) {
    types.push("bookmarks", "history");
  }
  try {
    if ((await profileExtensions(dir)).length) {
      types.push("extensions");
    }
  } catch (error) {
    console.error("[NWBrowserImport] Couldn't read the extensions of", dir, error);
  }
  return types;
}

// Firefox-family browsers with at least one profile that has something to
// import. A profile's id is its folder.
export async function geckoSources(): Promise<GeckoSource[]> {
  const sources: GeckoSource[] = [];
  for (const browser of GECKO_BROWSERS) {
    try {
      const profiles: GeckoSource["profiles"] = [];
      for (const profile of await listProfiles(browser)) {
        const types = await profileTypes(profile.dir);
        if (types.length) {
          profiles.push({ id: profile.dir, name: profile.name, types });
        }
      }
      if (profiles.length) {
        sources.push({ key: browser.key, name: browser.name, profiles });
      }
    } catch (error) {
      console.error("[NWBrowserImport] Couldn't check", browser.key, error);
    }
  }
  return sources;
}

export function isGeckoSource(key: string): boolean {
  return GECKO_BROWSERS.some((browser) => browser.key === key);
}

// Only folders of profiles that source lists, so a caller can't point the
// import at an arbitrary path.
export async function geckoProfileDir(key: string, profileId: string): Promise<string | null> {
  const browser = GECKO_BROWSERS.find((candidate) => candidate.key === key);
  if (!browser) {
    return null;
  }
  const profiles = await listProfiles(browser);
  return profiles.find((profile) => profile.dir === profileId)?.dir ?? null;
}

export async function importGeckoType(dir: string, type: ImportType): Promise<ImportResult> {
  switch (type) {
    case "tabs": {
      const tabs = await readTabs(dir);
      return { type, ok: true, count: tabs.length, tabs };
    }
    case "bookmarks":
      return { type, ok: true, count: await importBookmarks(dir) };
    case "history":
      return { type, ok: true, count: await importHistory(dir) };
    case "extensions": {
      const { installed, present, missed } = await importExtensions(dir);
      if (missed && !installed && !present) {
        return { type, ok: false, count: 0, error: "Couldn't find these extensions for Kit" };
      }
      return { type, ok: true, count: installed };
    }
    case "passwords":
      return { type, ok: false, error: "Passwords can't be imported from this browser" };
  }
}
