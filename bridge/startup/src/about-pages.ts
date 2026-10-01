// Loaded into Firefox's about: pages that Kit restyles (NRAboutPreferences
// and NWAboutDownloads actors). One script for all of them: subscripts can't
// import, so the pages can't share code across separate bundles.

import { initKitDownloads } from "./kit-downloads/index.ts";
import { initKitPreferences } from "./kit-preferences/index.ts";

// In Firefox browser chrome context, document is always available.
// Gecko types declare it as `Document | null`, but it is never null here.
const doc = document!;

// Kit's new tab page replaces about:newtab and about:home, so Firefox's
// homepage and Firefox Home settings have no effect. CSS rather than removing
// nodes, so it survives Lit re-rendering the redesigned settings groups. The
// startup and default-browser groups in the same pane stay.
function hideHomePageSettings(): void {
  const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
  style.textContent = `
    setting-pane[data-category="paneHome"] setting-group[groupid="homepage"],
    setting-pane[data-category="paneHome"] setting-group[groupid="home"],
    #homepageGroup,
    #homeContentsGroup,
    #firefoxHomeCategory {
      display: none !important;
    }
  `;
  doc.documentElement?.appendChild(style);
}

if (doc.documentURI?.startsWith("about:downloads")) {
  initKitDownloads(doc);
} else {
  hideHomePageSettings();
  initKitPreferences(doc);
}
