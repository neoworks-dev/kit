/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Alt+click on a link opens it in a preview card over the page instead of
// navigating (neoworks-link-preview).

export const NW_LINK_PREVIEW_OPEN_MESSAGE = "NWLinkPreview:Open";

// Dispatched on the browser window with an NWLinkPreviewRequest as detail.
export const NW_LINK_PREVIEW_EVENT = "NeoworksLinkPreview";

export interface NWLinkPreviewRequest {
  url: string;
  // The <browser> the link was clicked in.
  browser: Element;
  // The clicking page's principal, used to load the preview.
  triggeringPrincipal: nsIPrincipal;
}

export function isPreviewableUrl(url: unknown): url is string {
  if (typeof url !== "string") {
    return false;
  }
  return url.startsWith("https://") || url.startsWith("http://");
}
