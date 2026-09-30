/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  NW_COMMAND_EVENT,
  type NWCommandInvocation,
} from "../common/NWKeymap.ts";

export class NRStartPageParent extends JSWindowActorParent {
  async receiveMessage(message: ReceiveMessageArgument) {
    switch (message.name) {
      case "NRStartPage:GetCurrentTopSites": {
        const { NewTabUtils } = ChromeUtils.importESModule(
          "resource://gre/modules/NewTabUtils.sys.mjs",
        );
        const { AboutNewTab } = ChromeUtils.importESModule(
          "resource:///modules/AboutNewTab.sys.mjs",
        );
        let topSites = [];
        try {
          const aboutNewTabSites = AboutNewTab.getTopSites();
          topSites = aboutNewTabSites.length > 0
            ? aboutNewTabSites
            : await NewTabUtils.activityStreamLinks.getTopSites();
        } catch (e) {
          console.error("[NRStartPageParent] Error while getting top sites:", e);
        }

        this.sendAsyncMessage(
          "NRStartPage:GetCurrentTopSites",
          JSON.stringify({ topsites: topSites }),
        );
        break;
      }

      // Kit's command layer (neoworks-commands) listens for this event.
      case "NRStartPage:OpenSpotlight": {
        const win = this.browsingContext?.topChromeWindow;
        if (!win) {
          break;
        }
        const invocation: NWCommandInvocation = { command: "spotlight:open" };
        win.dispatchEvent(
          new win.CustomEvent(NW_COMMAND_EVENT, { detail: invocation }),
        );
        break;
      }
    }
  }
}
