/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  NW_SPOTLIGHT_OPEN_EVENT,
  NW_SPOTLIGHT_OPEN_MESSAGE,
} from "../common/NWSpotlightTypes.ts";

export class NWSpotlightParent extends JSWindowActorParent {
  receiveMessage(message: { name: string }): void {
    if (message.name !== NW_SPOTLIGHT_OPEN_MESSAGE) {
      return;
    }
    const browser = this.browsingContext?.top?.embedderElement;
    const browserWindow = browser?.ownerDocument?.defaultView;
    if (!browserWindow) {
      console.error("[NWSpotlight] No browser window for", this.browsingContext);
      return;
    }
    browserWindow.dispatchEvent(
      new browserWindow.CustomEvent(NW_SPOTLIGHT_OPEN_EVENT),
    );
  }
}
