/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

// The active theme's new tab colors as CSS colors; null for the ones it
// doesn't set. Firefox shares them per window as `theme/<outer window id>`
// (LightweightThemeConsumer's content properties).
interface NewTabTheme {
  background: string | null;
  text: string | null;
  card: string | null;
}

function cssColor(color: unknown): string | null {
  if (!color || typeof color !== "object") {
    return null;
  }
  const { r, g, b, a } = color as RGBA;
  return `rgba(${r}, ${g}, ${b}, ${a ?? 1})`;
}

// Exposes the browser calls the new tab page (pages-newtab) needs.
export class NRStartPageChild extends JSWindowActorChild {
  resolveGetCurrentTopSites: ((topSites: string) => void) | null = null;
  bridged = false;

  actorCreated() {
    const window = this.contentWindow;
    // In dev the actor matches all of localhost; only the new tab's dev
    // server (port 5186) gets the bridge.
    if (
      window &&
      (window.location.protocol !== "http:" || window.location.port === "5186")
    ) {
      Cu.exportFunction(this.GetCurrentTopSites.bind(this), window, {
        defineAs: "NRGetCurrentTopSites",
      });
      Cu.exportFunction(this.OpenSpotlight.bind(this), window, {
        defineAs: "NROpenSpotlight",
      });
      Cu.exportFunction(this.GetTheme.bind(this), window, {
        defineAs: "NRGetTheme",
      });
      this.bridged = true;
      Services.cpmm.sharedData?.addEventListener("change", this);
      // The actor starts at DOMContentLoaded, after the page's scripts ran.
      this.notifyThemeChanged();
    }
  }

  didDestroy() {
    if (this.bridged) {
      Services.cpmm.sharedData?.removeEventListener("change", this);
    }
  }

  // The browser window this page shows in, which keys its theme data.
  // As in Firefox's LightweightThemeChild.
  chromeOuterWindowID(): number {
    try {
      const browserChild = this.docShell?.browserChild;
      if (browserChild) {
        return browserChild.chromeOuterWindowID;
      }
    } catch {
      // No browserChild: the page runs in the parent process.
    }
    if (
      Services.appinfo.processType === Services.appinfo.PROCESS_TYPE_DEFAULT
    ) {
      // In the parent process the context is canonical, which has it.
      const context = this.browsingContext as
        | (BrowsingContext & { topChromeWindow?: Window | null })
        | null;
      return context?.topChromeWindow?.docShell?.outerWindowID ?? 0;
    }
    return 0;
  }

  GetTheme(): string {
    const data = Services.cpmm.sharedData?.get(
      `theme/${this.chromeOuterWindowID()}`,
    ) as Record<string, unknown> | undefined;
    const theme: NewTabTheme = {
      background: cssColor(data?.ntp_background),
      text: cssColor(data?.ntp_text),
      card: cssColor(data?.ntp_card_background),
    };
    return JSON.stringify(theme);
  }

  GetCurrentTopSites(callback: (topSites: string) => void = () => {}) {
    const promise = new Promise<string>((resolve) => {
      this.resolveGetCurrentTopSites = resolve;
    });
    this.sendAsyncMessage("NRStartPage:GetCurrentTopSites");
    promise.then((topSites) => callback(topSites));
  }

  OpenSpotlight() {
    this.sendAsyncMessage("NRStartPage:OpenSpotlight");
  }

  receiveMessage(message: ReceiveMessageArgument) {
    if (message.name === "NRStartPage:GetCurrentTopSites") {
      this.resolveGetCurrentTopSites?.(message.data);
      this.resolveGetCurrentTopSites = null;
    }
  }

  handleEvent(event: Event): void {
    const changedKeys = (event as Event & { changedKeys?: string[] })
      .changedKeys;
    if (
      event.type === "change" &&
      changedKeys?.includes(`theme/${this.chromeOuterWindowID()}`)
    ) {
      this.notifyThemeChanged();
    }
  }

  // The page asks NRGetTheme again (pages-newtab lib/theme.ts).
  notifyThemeChanged(): void {
    const window = this.contentWindow;
    window?.dispatchEvent(new window.Event("NRThemeChanged"));
  }
}
