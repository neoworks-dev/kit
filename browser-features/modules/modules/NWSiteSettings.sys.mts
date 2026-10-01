// SPDX-License-Identifier: MPL-2.0

// Per-site settings, one store for all windows, kept as JSON in the profile.
// Every change is published to content processes (the NWSiteStyle actor) and
// announced to the windows with an observer notification.

import {
  NW_SITE_SETTINGS_CHANGED_TOPIC,
  NW_SITE_STYLES_KEY,
  type NWSiteSettings,
  type NWSiteStyles,
} from "../common/NWSiteSettings.ts";

const FILE_NAME = "neoworks-site-settings.json";
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;

const settings = new Map<string, NWSiteSettings>();
let loading: Promise<void> | null = null;
let saving: Promise<void> = Promise.resolve();

function filePath(): string {
  return PathUtils.join(PathUtils.profileDir, FILE_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Drops unknown fields, defaults and invalid values; undefined if nothing is
// left.
function clean(value: unknown): NWSiteSettings | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const result: NWSiteSettings = {};
  if (typeof value.css === "string" && value.css.trim() !== "") {
    result.css = value.css;
  }
  if (value.darkMode === true) {
    result.darkMode = true;
  }
  const zoom = value.zoom;
  if (typeof zoom === "number" && zoom >= MIN_ZOOM && zoom <= MAX_ZOOM) {
    result.zoom = zoom;
  }
  if (Object.keys(result).length === 0) {
    return undefined;
  }
  return result;
}

function publishStyles(): void {
  const styles: NWSiteStyles = {};
  for (const [site, entry] of settings) {
    if (entry.css || entry.darkMode) {
      styles[site] = { css: entry.css, darkMode: entry.darkMode };
    }
  }
  Services.ppmm.sharedData.set(NW_SITE_STYLES_KEY, styles);
  Services.ppmm.sharedData.flush();
}

async function readFile(): Promise<void> {
  try {
    if (await IOUtils.exists(filePath())) {
      const data: unknown = await IOUtils.readJSON(filePath());
      if (isRecord(data)) {
        for (const [site, value] of Object.entries(data)) {
          const entry = clean(value);
          if (entry) {
            settings.set(site, entry);
          }
        }
      }
    }
  } catch (error) {
    console.error("[NWSiteSettings] Couldn't read the site settings:", error);
  }
  publishStyles();
}

// Writes queue up so an older snapshot never lands last.
function save(): Promise<void> {
  const snapshot = Object.fromEntries(settings);
  saving = saving.then(async () => {
    await IOUtils.writeJSON(filePath(), snapshot, { tmpPath: `${filePath()}.tmp` });
  }).catch((error: unknown) => {
    console.error("[NWSiteSettings] Couldn't save the site settings:", error);
  });
  return saving;
}

export function loadSiteSettings(): Promise<void> {
  loading ??= readFile();
  return loading;
}

// Empty until loadSiteSettings() resolved.
export function siteSettings(site: string): NWSiteSettings {
  return { ...settings.get(site) };
}

// Merges the changes; a field set to undefined goes back to Firefox's default.
export async function updateSiteSettings(
  site: string,
  changes: Partial<NWSiteSettings>,
): Promise<void> {
  await loadSiteSettings();
  const entry = clean({ ...settings.get(site), ...changes });
  if (entry) {
    settings.set(site, entry);
  } else {
    settings.delete(site);
  }
  publishStyles();
  Services.obs.notifyObservers(null as unknown as nsISupports, NW_SITE_SETTINGS_CHANGED_TOPIC, site);
  await save();
}
