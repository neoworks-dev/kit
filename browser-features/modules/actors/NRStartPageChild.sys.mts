/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Exposes the browser calls the new tab page (pages-newtab) needs.
export class NRStartPageChild extends JSWindowActorChild {
  resolveGetCurrentTopSites: ((topSites: string) => void) | null = null;

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
    }
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

  handleEvent(_event: Event): void {
    // No-op
  }
}
