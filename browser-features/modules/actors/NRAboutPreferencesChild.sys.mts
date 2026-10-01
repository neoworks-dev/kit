const PREFERENCES_SCRIPT = "chrome://noraneko-startup/content/about-pages.js";

export class NRAboutPreferencesChild extends JSWindowActorChild {
  handleEvent(event: Event): void {
    if (event.type !== "DOMDocElementInserted") {
      return;
    }
    // Loaded before the page parses, so it can theme the page before the
    // first paint and register Kit's pane ahead of the page's own
    // DOMContentLoaded init (which opens the pane named in the URL hash).
    //https://searchfox.org/mozilla-central/rev/3a34b4616994bd8d2b6ede2644afa62eaec817d1/browser/actors/AboutNewTabChild.sys.mjs#70
    Services.scriptloader.loadSubScript(PREFERENCES_SCRIPT, this.contentWindow);
  }
}
