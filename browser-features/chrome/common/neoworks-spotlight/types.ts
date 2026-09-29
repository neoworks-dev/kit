// SPDX-License-Identifier: MPL-2.0

import type { BrowserTab } from "../neoworks-sidebar/types.ts";

export type SpotlightResultKind = "navigate" | "tab" | "bookmark" | "history";

export interface SpotlightResult {
  kind: SpotlightResultKind;
  title: string;
  subtitle: string;
  url: string;
  tab?: BrowserTab;
}
