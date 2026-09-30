// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/solid-xul";
import { LinkPreview } from "./preview-card.tsx";
import glassStyle from "../neoworks-ui/glass.css?inline";
import iconStyle from "../neoworks-ui/icons.css?inline";
import previewStyle from "./link-preview.css?inline";

export function mountLinkPreview(browserBox: Element): void {
  render(() => <LinkPreview style={glassStyle + iconStyle + previewStyle} />, browserBox, {
    hotCtx: import.meta.hot,
  });
}
