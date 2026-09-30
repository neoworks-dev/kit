// SPDX-License-Identifier: MPL-2.0

import type { WidgetSettings, WidgetSize } from "../widgets/types.ts";

export interface WidgetInstance {
  id: string;
  type: string;
  size: WidgetSize;
  // Only what the user changed; merged over the type's default settings.
  settings: WidgetSettings;
}

export interface NewTabLayout {
  version: 1;
  widgets: WidgetInstance[];
}
