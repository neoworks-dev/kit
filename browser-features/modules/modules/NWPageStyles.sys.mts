// SPDX-License-Identifier: MPL-2.0

// Kit's look for Firefox's own about: pages, as a user sheet scoped to them.
// The style service hands registered sheets to every content process. This
// module keeps the one registered sheet for all windows; the stylesheet
// itself lives with the chrome feature (neoworks-firefox-pages), so it hot
// reloads in dev. Reader view has its own (NWReaderStyle.sys.mts).

// Kit's own new tab page (about:newtab, about:home) is left out.
const PAGE_URL_PREFIXES = [
  "about:addons",
  "about:blocked",
  "about:certerror",
  "about:certificate",
  "about:config",
  "about:downloads",
  "about:httpsonlyerror",
  "about:logins",
  "about:neterror",
  "about:policies",
  "about:preferences",
  "about:privatebrowsing",
  "about:processes",
  "about:profiles",
  "about:protections",
  "about:restartrequired",
  "about:sessionrestore",
  "about:support",
  "about:tabcrashed",
  "about:welcomeback",
];

const styleService = Cc["@mozilla.org/content/style-sheet-service;1"]
  .getService(
    Ci.nsIStyleSheetService,
  );

// The generated XPCOM types mark interface constants as optional.
const USER_SHEET = Ci.nsIStyleSheetService.USER_SHEET ?? 1;

let registered: nsIURI | null = null;

function unregister(): void {
  if (registered && styleService.sheetRegistered(registered, USER_SHEET)) {
    styleService.unregisterSheet(registered, USER_SHEET);
  }
  registered = null;
}

// Replaces the pages' sheet; calling it again with the same CSS is a no-op.
export function setPageStyle(css: string): void {
  // Only user and agent sheets may scope themselves to a URL.
  const prefixes = PAGE_URL_PREFIXES.map((prefix) => `url-prefix("${prefix}")`)
    .join(", ");
  const scoped = `@-moz-document ${prefixes} {\n${css}\n}`;
  const uri = Services.io.newURI(
    `data:text/css;charset=utf-8,${encodeURIComponent(scoped)}`,
  );
  if (registered?.equals(uri)) {
    return;
  }
  try {
    unregister();
    styleService.loadAndRegisterSheet(uri, USER_SHEET);
    registered = uri;
  } catch (error) {
    console.error(
      "[NWPageStyles] Couldn't register the Firefox pages sheet:",
      error,
    );
  }
}
