// SPDX-License-Identifier: MPL-2.0

// A site's default zoom. Firefox remembers zoom per host (site-specific zoom);
// where it has no value for a host, FullZoom falls back to the global default.
// Kit puts the site's default zoom in between, so zooming a page still works
// as before and resetting goes back to the site's default.

import { siteOf } from "#features-modules/common/NWSiteSettings.ts";
import { currentSiteSettings, updateSite } from "./site-settings.ts";
import type { FullZoomObject, ZoomBrowser, ZoomWindow } from "./types.ts";

function zoomWindow(): ZoomWindow {
  return window as unknown as ZoomWindow;
}

function siteDefaultZoom(browser: ZoomBrowser): number | undefined {
  const site = siteOf(browser.currentURI);
  if (!site) {
    return undefined;
  }
  return currentSiteSettings(site).zoom;
}

// Returns a function that restores Firefox's FullZoom.
export function patchFullZoom(): () => void {
  const { FullZoom: fullZoom, ZoomManager: zoomManager } = zoomWindow();
  const originalApply = fullZoom._applyPrefToZoom;
  const originalReset = fullZoom.reset;

  fullZoom._applyPrefToZoom = function (
    this: FullZoomObject,
    value: number | undefined,
    browser: ZoomBrowser,
    callback?: () => void,
  ) {
    return originalApply.call(this, value ?? siteDefaultZoom(browser), browser, callback);
  };

  fullZoom.reset = function (
    this: FullZoomObject,
    browser: ZoomBrowser = zoomWindow().gBrowser.selectedBrowser,
  ) {
    const result = originalReset.call(this, browser);
    const zoom = siteDefaultZoom(browser);
    if (zoom === undefined) {
      return result;
    }
    return result.then(() => zoomManager.setZoomForBrowser(browser, zoom));
  };

  return () => {
    fullZoom._applyPrefToZoom = originalApply;
    fullZoom.reset = originalReset;
  };
}

// Re-runs Firefox's zoom lookup for the site's pages in this window: their
// own remembered zoom if any, else the site's default.
export function reapplySiteZoom(site: string): void {
  const { FullZoom: fullZoom, gBrowser } = zoomWindow();
  for (const browser of gBrowser.browsers) {
    if (siteOf(browser.currentURI) === site) {
      fullZoom.onLocationChange(browser.currentURI, false, browser);
    }
  }
}

// Makes the page's current zoom the site's default. The host's remembered
// zoom goes, so the default is what the site's pages get from now on.
export function useCurrentZoomAsDefault(site: string, zoom: number): Promise<void> {
  const { FullZoom: fullZoom, gBrowser } = zoomWindow();
  fullZoom._removePref(gBrowser.selectedBrowser);
  return updateSite(site, { zoom });
}

export async function clearDefaultZoom(site: string): Promise<void> {
  await updateSite(site, { zoom: undefined });
  await zoomWindow().FullZoom.reset();
}
