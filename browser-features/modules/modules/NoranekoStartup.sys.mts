/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Keep the existing browser UI during the Firefox 157 transition. Locking the
// preferences masks a profile's prior Nova opt-in without deleting it.
for (
  const pref of [
    "browser.nova.enabled",
    "browser.newtabpage.activity-stream.nova.enabled",
  ]
) {
  Services.prefs.getDefaultBranch("").setBoolPref(pref, false);
  Services.prefs.lockPref(pref);
}

// Firefox opens a load into a pinned tab in a new tab when it would change
// the tab's host (bookmarks, the search bar). Kit's pinned tabs and
// Essentials browse like any other tab; neoworks-sidebar/pinned-navigation.ts
// does the same for links clicked in the page.
function browseInPinnedTabs(): void {
  const { URILoadingHelper } = ChromeUtils.importESModule(
    "resource:///modules/URILoadingHelper.sys.mjs",
  ) as {
    URILoadingHelper: {
      openLinkIn(
        window: Window,
        url: string,
        where: string,
        params?: Record<string, unknown>,
      ): unknown;
    };
  };
  const openLinkIn = URILoadingHelper.openLinkIn;
  URILoadingHelper.openLinkIn = function (window, url, where, params) {
    return openLinkIn.call(this, window, url, where, {
      ...params,
      allowPinnedTabHostChange: true,
    });
  };
}

try {
  browseInPinnedTabs();
} catch (error) {
  console.error("[NoranekoStartup] Couldn't let pinned tabs change host:", error);
}

/**
 * Get nsIComponentRegistrar from Components.manager via QueryInterface.
 * Components.manager needs explicit QI to access registerFactory.
 */
function getComponentRegistrar(): nsIComponentRegistrar | null {
  try {
    const cm = Components.manager;
    if (cm === undefined || cm === null) {
      return null;
    }
    // Components.manager has QueryInterface at runtime but TypeScript defs don't reflect it
    const maybeQI = (cm as unknown as { QueryInterface?: (iid: nsIID) => unknown }).QueryInterface;
    if (typeof maybeQI !== "function") {
      return null;
    }
    return maybeQI.call(cm, Ci.nsIComponentRegistrar) as nsIComponentRegistrar;
  } catch (e) {
    console.error("[NoranekoStartup] Failed to get nsIComponentRegistrar:", e);
    return null;
  }
}

async function isResourceAvailable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch (error) {
    console.error(`[noraneko] Failed to check resource: ${url}`, error);
    return false;
  }
}

// Only for dev build
async function setupNoranekoNewTab(): Promise<void> {
  const { AboutNewTab } = ChromeUtils.importESModule(
    "resource:///modules/AboutNewTab.sys.mjs",
  );

  if (
    (await isResourceAvailable(
      "chrome://noraneko-newtab/content/index.html",
    )) === false
  ) {
    // Fallback for dev build about:newtab if file doesn't exist
    AboutNewTab.newTabURL = "http://localhost:5186/";
  }
}

/* Register Custom About Pages
 *
 * Credits: angelbruni/Geckium on GitHub
 * This code is the TypeScript version of the original JavaScript code.
 *
 * File referred: https://github.com/angelbruni/Geckium/blob/main/Profile%20Folder/chrome/JS/Geckium_aboutPageRegisterer.uc.js
 */

// Kit's new tab page (pages-newtab) replaces Firefox's about:newtab and
// about:home. Dev builds serve it from Vite.
const getCustomAboutPages = async (): Promise<Record<string, string>> => {
  let newTab = "chrome://noraneko-newtab/content/index.html";
  if (!(await isResourceAvailable(newTab))) {
    newTab = "http://localhost:5186/";
  }
  return { newtab: newTab, home: newTab };
};

class CustomAboutPage {
  private _uri: nsIURI;

  constructor(urlString: string) {
    this._uri = Services.io.newURI(urlString);
  }

  get uri(): nsIURI {
    return this._uri;
  }

  newChannel(_uri: nsIURI, loadInfo: nsILoadInfo): nsIChannel {
    const query = _uri.query ? `?${_uri.query}` : "";
    const ref = _uri.ref ? `#${_uri.ref}` : "";
    const targetUri = Services.io.newURI(`${this.uri.spec}${query}${ref}`);
    const new_ch = Services.io.newChannelFromURIWithLoadInfo(
      targetUri,
      loadInfo,
    );
    new_ch.owner = Services.scriptSecurityManager.getSystemPrincipal();
    return new_ch;
  }

  getURIFlags(_uri: nsIURI): number {
    if (!this.uri) {
      throw new Error("URI is not defined");
    }

    return (
      (Ci.nsIAboutModule.ALLOW_SCRIPT as number) |
      (Ci.nsIAboutModule.IS_SECURE_CHROME_UI as number)
    );
  }

  getChromeURI(_uri: nsIURI): nsIURI {
    return this.uri;
  }

  QueryInterface = ChromeUtils.generateQI(["nsIAboutModule"]);
}

async function registerCustomAboutPages(): Promise<void> {
  const customAboutPages = await getCustomAboutPages();

  for (const aboutKey in customAboutPages) {
    const AboutModuleFactory: nsIFactory = {
      createInstance<T extends nsIID>(iid: T): nsQIResult<T> {
        return new CustomAboutPage(customAboutPages[aboutKey]).QueryInterface(
          iid,
        );
      },
    };

    const registrar = getComponentRegistrar();
    if (!registrar) {
      console.error("[NoranekoStartup] Failed to get nsIComponentRegistrar");
      continue;
    }
    registrar.registerFactory(
      Services.uuid.generateUUID(),
      `about:${aboutKey}`,
      `@mozilla.org/network/protocol/about;1?what=${aboutKey}`,
      AboutModuleFactory,
    );
  }
}

(async () => {
  await registerCustomAboutPages();
  await setupNoranekoNewTab();
})().catch(console.error);
