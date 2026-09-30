// SPDX-License-Identifier: MPL-2.0

// Kit's tab archive: tabs that went unused for too long, closed by the
// sidebar (neoworks-sidebar/tab-archive.ts) and kept here so the spotlight
// can find and reopen them. One list for all windows, saved as JSON in the
// profile. Private windows never archive, so nothing private lands on disk.

export interface ArchivedTab {
  id: string;
  title: string;
  url: string;
  image: string;
  // ms since the epoch.
  archivedAt: number;
  // SessionStore's tab state (history, workspace), for reopening.
  state: string;
}

export const TAB_ARCHIVE_CHANGED_TOPIC = "neoworks-tab-archive-changed";

const FILE_NAME = "neoworks-tab-archive.json";
// Oldest entries go first once the archive is full.
const MAX_ENTRIES = 500;

let entries: ArchivedTab[] = [];
let loading: Promise<void> | null = null;

function filePath(): string {
  return PathUtils.join(PathUtils.profileDir, FILE_NAME);
}

function isArchivedTab(value: unknown): value is ArchivedTab {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && typeof entry.url === "string" &&
    typeof entry.state === "string" && typeof entry.archivedAt === "number";
}

async function load(): Promise<void> {
  try {
    if (!(await IOUtils.exists(filePath()))) {
      return;
    }
    const stored = await IOUtils.readJSON(filePath());
    if (Array.isArray(stored)) {
      entries = stored.filter(isArchivedTab);
    }
  } catch (error) {
    console.error("[NWTabArchive] Couldn't read the tab archive:", error);
  }
}

// Resolves once the archive file has been read.
export function ready(): Promise<void> {
  if (!loading) {
    loading = load().then(notify);
  }
  return loading;
}

function notify(): void {
  // The generated XPCOM types don't allow the usual null subject.
  Services.obs.notifyObservers(null as unknown as nsISupports, TAB_ARCHIVE_CHANGED_TOPIC);
}

async function save(): Promise<void> {
  try {
    await IOUtils.writeJSON(filePath(), entries, { tmpPath: `${filePath()}.tmp` });
  } catch (error) {
    console.error("[NWTabArchive] Couldn't save the tab archive:", error);
  }
}

// Newest first. Empty until ready() has resolved.
export function archivedTabs(): ArchivedTab[] {
  return entries;
}

export async function archive(added: ArchivedTab[]): Promise<void> {
  if (added.length === 0) {
    return;
  }
  await ready();
  entries = [...added, ...entries].slice(0, MAX_ENTRIES);
  notify();
  await save();
}

export async function remove(id: string): Promise<void> {
  await ready();
  entries = entries.filter((entry) => entry.id !== id);
  notify();
  await save();
}
