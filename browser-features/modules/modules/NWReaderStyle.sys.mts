// SPDX-License-Identifier: MPL-2.0

// Kit's look for Firefox's reader view (about:reader), as a user sheet scoped
// to reader pages. The style service hands registered sheets to every content
// process. This module keeps the one registered sheet for all windows; the
// stylesheet itself lives with the chrome feature (neoworks-reader), so it
// hot reloads in dev.

const READER_URL_PREFIX = "about:reader";

const styleService = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
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

// Replaces the reader sheet; calling it again with the same CSS is a no-op.
export function setReaderStyle(css: string): void {
  // User sheets win over the page's own styles only with !important, and
  // only user and agent sheets may scope themselves to a URL.
  const scoped = `@-moz-document url-prefix("${READER_URL_PREFIX}") {\n${css}\n}`;
  const uri = Services.io.newURI(`data:text/css;charset=utf-8,${encodeURIComponent(scoped)}`);
  if (registered?.equals(uri)) {
    return;
  }
  try {
    unregister();
    styleService.loadAndRegisterSheet(uri, USER_SHEET);
    registered = uri;
  } catch (error) {
    console.error("[NWReaderStyle] Couldn't register the reader view sheet:", error);
  }
}
