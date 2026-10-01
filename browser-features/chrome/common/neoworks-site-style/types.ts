// SPDX-License-Identifier: MPL-2.0

import type { NWSiteSettings } from "#features-modules/common/NWSiteSettings.ts";

// NWSiteSettings.sys.mts: the per-site settings store shared by all windows.
export interface SiteSettingsModule {
  loadSiteSettings(): Promise<void>;
  siteSettings(site: string): NWSiteSettings;
  updateSiteSettings(site: string, changes: Partial<NWSiteSettings>): Promise<void>;
}

export interface ZoomBrowser {
  currentURI: nsIURI;
}

// The parts of Firefox's FullZoom (browser-fullZoom.js) Kit wraps or calls.
export interface FullZoomObject {
  _applyPrefToZoom(
    value: number | undefined,
    browser: ZoomBrowser,
    callback?: () => void,
  ): void;
  _removePref(browser: ZoomBrowser): void;
  onLocationChange(uri: nsIURI, isTabSwitch: boolean, browser: ZoomBrowser): void;
  reset(browser?: ZoomBrowser): Promise<void>;
}

export interface ZoomWindow {
  FullZoom: FullZoomObject;
  ZoomManager: { setZoomForBrowser(browser: ZoomBrowser, zoom: number): void };
  gBrowser: { selectedBrowser: ZoomBrowser; browsers: ZoomBrowser[] };
}
