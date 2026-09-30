const PREFERENCES_SCRIPT = "chrome://noraneko-startup/content/about-preferences.js";
const IP_PROTECTION_GUARD_ID = "floorp-ipprotection-preferences-guard";

export class NRAboutPreferencesChild extends JSWindowActorChild {
  handleEvent(event: Event): void {
    if (event.type !== "DOMDocElementInserted") {
      return;
    }
    const doc = this.contentWindow?.document;
    if (!doc?.documentElement || doc.getElementById(IP_PROTECTION_GUARD_ID)) {
      return;
    }
    const style = doc.createElement("style");
    style.id = IP_PROTECTION_GUARD_ID;
    style.textContent = `
      setting-group[groupid="ipprotection"]:not([data-floorp-ipprotection-ready="true"]) {
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    doc.documentElement.append(style);
    // Loaded before the page parses, so it can theme the page before the
    // first paint and register Kit's pane ahead of the page's own
    // DOMContentLoaded init (which opens the pane named in the URL hash).
    //https://searchfox.org/mozilla-central/rev/3a34b4616994bd8d2b6ede2644afa62eaec817d1/browser/actors/AboutNewTabChild.sys.mjs#70
    Services.scriptloader.loadSubScript(PREFERENCES_SCRIPT, this.contentWindow);
  }
}
