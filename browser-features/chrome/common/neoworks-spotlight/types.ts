// SPDX-License-Identifier: MPL-2.0

import type { NWCommandId } from "#features-modules/common/NWKeymap.ts";
import type { Quickmark } from "../neoworks-commands/quickmarks.ts";
import type { BrowserTab } from "../neoworks-sidebar/types.ts";

interface ResultText {
  title: string;
  subtitle: string;
}

export type UrlResultKind = "navigate" | "suggestion" | "bookmark" | "history";

export type SpotlightResult =
  | ResultText & { kind: UrlResultKind; url: string }
  | ResultText & { kind: "tab"; tab: BrowserTab }
  | ResultText & { kind: "quickmark"; quickmark: Quickmark }
  | ResultText & { kind: "command"; command: NWCommandId; shortcut: string };

export type SpotlightResultKind = SpotlightResult["kind"];
