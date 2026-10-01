// SPDX-License-Identifier: MPL-2.0

// Links opened from other apps (#48). The OS hands them to the command line
// handler, which calls openURI with OPEN_EXTERNAL on the top browser window's
// BrowserDOMWindow. Kit opens them in a small window without its sidebar and
// top bar instead of piling them up as tabs; neoworks-link-window gives that
// window its header.
//
// window.browserDOMWindow is an XPConnect wrapper whose methods can't be
// replaced, so this wraps BrowserDOMWindow.prototype.openURI, once for all
// windows.

const { BrowserDOMWindow } = ChromeUtils.importESModule(
  "resource:///modules/BrowserDOMWindow.sys.mjs",
) as { BrowserDOMWindow: { prototype: BrowserDOMWindowLike } };

const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
) as { PrivateBrowsingUtils: { isWindowPrivate(window: Window): boolean } };

interface BrowserDOMWindowLike {
  win: Window;
  openURI(
    uri: nsIURI | null,
    openWindowInfo: unknown,
    where: number,
    flags: number,
    triggeringPrincipal: nsIPrincipal,
    policyContainer?: unknown,
  ): unknown;
}

const EXTERNAL_POPUP_PREF = "neoworks.links.externalPopup";
const WINDOW_WIDTH = 960;
const WINDOW_HEIGHT = 720;

const BROWSER_DOM_WINDOW = Ci.nsIBrowserDOMWindow as unknown as Record<string, number>;
const OPEN_EXTERNAL = BROWSER_DOM_WINDOW.OPEN_EXTERNAL;
// Where-values that would otherwise become a new tab or follow the default.
const TAB_LIKE_TARGETS = new Set([
  BROWSER_DOM_WINDOW.OPEN_DEFAULTWINDOW,
  BROWSER_DOM_WINDOW.OPEN_NEWTAB,
  BROWSER_DOM_WINDOW.OPEN_NEWTAB_BACKGROUND,
  BROWSER_DOM_WINDOW.OPEN_NEWTAB_FOREGROUND,
  BROWSER_DOM_WINDOW.OPEN_NEWTAB_AFTER_CURRENT,
]);

let installed = false;

function opensInLinkWindow(
  uri: nsIURI | null,
  openWindowInfo: unknown,
  where: number,
  flags: number,
): uri is nsIURI {
  if (!uri || openWindowInfo || !(flags & OPEN_EXTERNAL) || !TAB_LIKE_TARGETS.has(where)) {
    return false;
  }
  if (!uri.schemeIs("http") && !uri.schemeIs("https")) {
    return false;
  }
  return Services.prefs.getBoolPref(EXTERNAL_POPUP_PREF, true);
}

// Opened like Firefox opens an external link in a new window, but without
// toolbars: window.toolbar.visible is false, which makes it a minimal window
// (and keeps BrowserWindowTracker from treating it as a main window).
function openLinkWindow(
  win: Window,
  uri: nsIURI,
  triggeringPrincipal: nsIPrincipal,
  policyContainer: unknown,
): void {
  const features = [
    "chrome",
    "dialog=no",
    "resizable",
    "minimizable",
    "titlebar",
    "close",
    "scrollbars",
    "toolbar=no",
    "location=no",
    "menubar=no",
    "personalbar=no",
    "status=no",
    "centerscreen",
    `width=${WINDOW_WIDTH}`,
    `height=${WINDOW_HEIGHT}`,
  ];
  if (PrivateBrowsingUtils.isWindowPrivate(win)) {
    features.push("private");
  }
  const extraOptions = Cc["@mozilla.org/hash-property-bag;1"].createInstance(
    Ci.nsIWritablePropertyBag2,
  );
  extraOptions.setPropertyAsBool("fromExternal", true);
  // The argument order browser-init.js expects (see BrowserDOMWindow's
  // OPEN_NEWWINDOW branch).
  win.openDialog(
    Services.prefs.getStringPref("browser.chromeURL", "chrome://browser/content/browser.xhtml"),
    "_blank",
    features.join(","),
    uri.spec,
    extraOptions,
    null,
    null,
    null,
    null,
    null,
    null,
    triggeringPrincipal,
    null,
    policyContainer,
  );
}

export function routeExternalLinks(): void {
  if (installed) {
    return;
  }
  installed = true;
  const prototype = BrowserDOMWindow.prototype;
  const original = prototype.openURI;
  prototype.openURI = function (
    this: BrowserDOMWindowLike,
    uri,
    openWindowInfo,
    where,
    flags,
    triggeringPrincipal,
    policyContainer,
  ) {
    if (opensInLinkWindow(uri, openWindowInfo, where, flags)) {
      try {
        openLinkWindow(this.win, uri, triggeringPrincipal, policyContainer);
        // Like Firefox's own new-window branch: the window is still loading.
        return null;
      } catch (error) {
        console.error("[NWLinkWindow] Opening the link window failed:", error);
      }
    }
    return original.call(
      this,
      uri,
      openWindowInfo,
      where,
      flags,
      triggeringPrincipal,
      policyContainer,
    );
  };
}
