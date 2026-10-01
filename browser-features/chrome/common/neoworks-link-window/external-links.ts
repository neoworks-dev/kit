// SPDX-License-Identifier: MPL-2.0

// Links from other apps open in a minimal window: NWLinkWindow.sys.mts wraps
// Firefox's BrowserDOMWindow once for all windows. Turning the pref off brings
// back new tabs.

export function routeExternalLinks(): void {
  const { routeExternalLinks: install } = ChromeUtils.importESModule(
    "resource://noraneko/modules/NWLinkWindow.sys.mjs",
  ) as { routeExternalLinks(): void };
  install();
}
