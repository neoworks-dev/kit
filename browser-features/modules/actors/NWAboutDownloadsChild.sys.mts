const DOWNLOADS_SCRIPT = "chrome://noraneko-startup/content/about-pages.js";

// Restyles about:downloads (bridge/startup/src/kit-downloads). Loaded before
// the page parses, so its first paint is already in Kit's style.
export class NWAboutDownloadsChild extends JSWindowActorChild {
  handleEvent(event: Event): void {
    if (event.type !== "DOMDocElementInserted") {
      return;
    }
    Services.scriptloader.loadSubScript(DOWNLOADS_SCRIPT, this.contentWindow);
  }
}
