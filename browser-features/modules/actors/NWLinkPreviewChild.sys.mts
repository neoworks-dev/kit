/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  isPreviewableUrl,
  NW_LINK_PREVIEW_OPEN_MESSAGE,
} from "../common/NWLinkPreview.ts";

const PRIMARY_BUTTON = 0;

type LinkElement = Element & { href: string };

function isPreviewClick(event: MouseEvent): boolean {
  return event.button === PRIMARY_BUTTON && event.altKey && !event.ctrlKey &&
    !event.shiftKey && !event.metaKey;
}

// The clicked <a href> or <area href>, also inside shadow roots.
function clickedLink(event: MouseEvent): LinkElement | null {
  for (const target of event.composedPath()) {
    const element = target as Partial<LinkElement>;
    const localName = element.localName;
    if ((localName === "a" || localName === "area") && element.hasAttribute?.("href")) {
      return element as LinkElement;
    }
  }
  return null;
}

// Firefox leaves plain Alt+click to the page (a normal navigation) unless
// browser.altClickSave turns it into "save link", which then wins.
export class NWLinkPreviewChild extends JSWindowActorChild {
  handleEvent(event: Event): void {
    const click = event as MouseEvent;
    if (!click.isTrusted || click.defaultPrevented || !isPreviewClick(click)) {
      return;
    }
    if (Services.prefs.getBoolPref("browser.altClickSave", false)) {
      return;
    }
    const url = clickedLink(click)?.href;
    if (!isPreviewableUrl(url)) {
      return;
    }
    // Actor listeners sit above the page's window: the page never sees it.
    click.preventDefault();
    click.stopImmediatePropagation();
    this.sendAsyncMessage(NW_LINK_PREVIEW_OPEN_MESSAGE, { url });
  }
}
