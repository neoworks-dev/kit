/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { ActorManagerParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ActorManagerParent.sys.mjs",
);

function localPathToResourceURI(path: string) {
  const re = new RegExp(/\.\.\/([a-zA-Z0-9-_/]+)\.sys\.mts/);
  const result = re.exec(path);
  if (!result || result.length != 2) {
    throw Error(
      `[nora-browserGlue] localPathToResource URI match failed : ${path}`,
    );
  }
  const resourceURI = `resource://noraneko/${result[1]}.sys.mjs`;
  return resourceURI;
}

const STARTUP_MODE = Services.prefs.getStringPref("nora.startup.mode", "");
const IS_LOCAL_DEVELOPMENT_MODE = STARTUP_MODE === "dev" ||
  STARTUP_MODE === "test";
const DEVELOPMENT_LOCALHOST_MATCHES = IS_LOCAL_DEVELOPMENT_MODE
  ? ["*://localhost/*"]
  : [];
const WEB_REMOTE_TYPES = ["web", "webIsolated", "webCOOP+COEP"];
const WEB_FILE_AND_ABOUT_REMOTE_TYPES = [
  ...WEB_REMOTE_TYPES,
  "file",
  "privilegedabout",
  "parent",
];
const DEVELOPMENT_WEB_ACTOR_OPTIONS: Partial<WindowActorOptions> =
  IS_LOCAL_DEVELOPMENT_MODE
    ? {
      // Firefox 154 treats even loopback documents as untrusted web-process
      // content. These options exist only in local development/test modes,
      // where the new tab page is served by Vite on localhost.
      remoteTypes: WEB_FILE_AND_ABOUT_REMOTE_TYPES,
      safeForUntrustedWebProcess: true,
    }
    : {};

const JS_WINDOW_ACTORS: {
  [k: string]: WindowActorOptions;
} = {
  NRAboutPreferences: {
    child: {
      esModuleURI: localPathToResourceURI(
        "../actors/NRAboutPreferencesChild.sys.mts",
      ),
      events: {
        DOMDocElementInserted: {},
      },
    },
    matches: ["about:preferences*", "about:settings*"],
  },
  NRStartPage: {
    parent: {
      esModuleURI: localPathToResourceURI(
        "../actors/NRStartPageParent.sys.mts",
      ),
    },
    child: {
      esModuleURI: localPathToResourceURI("../actors/NRStartPageChild.sys.mts"),
      events: {
        DOMContentLoaded: {},
      },
    },
    matches: [
      ...DEVELOPMENT_LOCALHOST_MATCHES,
      "chrome://noraneko-newtab/*",
      "about:newtab*",
      "about:home*",
    ],
    ...DEVELOPMENT_WEB_ACTOR_OPTIONS,
  },
  NWKeys: {
    parent: {
      esModuleURI: localPathToResourceURI(
        "../actors/NWKeysParent.sys.mts",
      ),
    },
    child: {
      esModuleURI: localPathToResourceURI(
        "../actors/NWKeysChild.sys.mts",
      ),
      events: {
        keydown: { capture: true },
        pagehide: {},
      },
    },
    matches: ["http://*/*", "https://*/*", "file:///*", "about:*"],
    remoteTypes: WEB_FILE_AND_ABOUT_REMOTE_TYPES,
    safeForUntrustedWebProcess: true,
    allFrames: true,
  },
  NWLinkPreview: {
    parent: {
      esModuleURI: localPathToResourceURI(
        "../actors/NWLinkPreviewParent.sys.mts",
      ),
    },
    child: {
      esModuleURI: localPathToResourceURI(
        "../actors/NWLinkPreviewChild.sys.mts",
      ),
      events: {
        click: { capture: true },
      },
    },
    matches: ["http://*/*", "https://*/*", "file:///*"],
    remoteTypes: WEB_FILE_AND_ABOUT_REMOTE_TYPES,
    safeForUntrustedWebProcess: true,
    allFrames: true,
  },
  // Per-site CSS and dark mode (NWSiteSettings.sys.mts). Top-level pages
  // only: an inverted page already inverts its frames.
  NWSiteStyle: {
    child: {
      esModuleURI: localPathToResourceURI(
        "../actors/NWSiteStyleChild.sys.mts",
      ),
      events: {
        DOMDocElementInserted: {},
        DOMContentLoaded: {},
      },
    },
    matches: ["http://*/*", "https://*/*"],
    remoteTypes: WEB_REMOTE_TYPES,
    safeForUntrustedWebProcess: true,
  },
};

ActorManagerParent.addJSWindowActors(JS_WINDOW_ACTORS);
