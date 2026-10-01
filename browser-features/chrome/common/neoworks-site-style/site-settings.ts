// SPDX-License-Identifier: MPL-2.0

// The chrome side of the per-site settings store: reactive reads for the page
// actions menu and change notifications from any window.

import { createSignal } from "solid-js";
import {
  NW_SITE_SETTINGS_CHANGED_TOPIC,
  type NWSiteSettings,
} from "#features-modules/common/NWSiteSettings.ts";
import type { SiteSettingsModule } from "./types.ts";

// Bumped on every change so readers re-run.
const [revision, setRevision] = createSignal(0);

function store(): SiteSettingsModule {
  return ChromeUtils.importESModule(
    "resource://noraneko/modules/NWSiteSettings.sys.mjs",
  ) as SiteSettingsModule;
}

export function loadSiteSettings(): Promise<void> {
  return store().loadSiteSettings();
}

// Not reactive; for event handlers and Firefox hooks.
export function currentSiteSettings(site: string): NWSiteSettings {
  return store().siteSettings(site);
}

export function readSiteSettings(site: string): NWSiteSettings {
  revision();
  return currentSiteSettings(site);
}

export function updateSite(site: string, changes: Partial<NWSiteSettings>): Promise<void> {
  return store().updateSiteSettings(site, changes).catch((error: unknown) => {
    console.error("[neoworks-site-style] Saving the site's settings failed:", error);
  });
}

// Calls onChange with the changed site. Returns a stop function.
export function watchSiteSettings(onChange: (site: string) => void): () => void {
  const observer = {
    observe(_subject: unknown, _topic: string, site: string) {
      setRevision((value) => value + 1);
      onChange(site);
    },
  };
  Services.obs.addObserver(observer, NW_SITE_SETTINGS_CHANGED_TOPIC);
  return () => Services.obs.removeObserver(observer, NW_SITE_SETTINGS_CHANGED_TOPIC);
}
