// SPDX-License-Identifier: MPL-2.0

import type { NeoworksTabbrowser } from "./types.ts";

export function tabbrowser(): NeoworksTabbrowser {
  return gBrowser as unknown as NeoworksTabbrowser;
}
