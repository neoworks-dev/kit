/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  isPreviewableUrl,
  NW_LINK_PREVIEW_EVENT,
  NW_LINK_PREVIEW_OPEN_MESSAGE,
  type NWLinkPreviewRequest,
} from "../common/NWLinkPreview.ts";

interface BrowserWindow extends Window {
  gBrowser?: unknown;
}

interface PreviewMessage {
  name: string;
  data?: { url?: unknown };
}

// Content is untrusted: only http(s) URLs pass, loaded with the page's own
// principal. The chrome side decides whether the clicking browser may preview.
export class NWLinkPreviewParent extends JSWindowActorParent {
  receiveMessage(message: PreviewMessage): void {
    if (message.name !== NW_LINK_PREVIEW_OPEN_MESSAGE) {
      return;
    }
    const url = message.data?.url;
    const principal = this.manager?.documentPrincipal;
    const browser = this.browsingContext?.top?.embedderElement;
    const browserWindow = browser?.ownerDocument?.defaultView as BrowserWindow | null | undefined;
    if (!isPreviewableUrl(url) || !principal || !browser || !browserWindow?.gBrowser) {
      return;
    }
    const request: NWLinkPreviewRequest = { url, browser, triggeringPrincipal: principal };
    browserWindow.dispatchEvent(
      new browserWindow.CustomEvent(NW_LINK_PREVIEW_EVENT, { detail: request }),
    );
  }
}
