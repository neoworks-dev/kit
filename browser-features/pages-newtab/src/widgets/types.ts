// SPDX-License-Identifier: MPL-2.0

import type { Component } from "solid-js";

// Columns a widget spans on the four-column board.
export type WidgetSize = "small" | "medium" | "full";

export type WidgetSettings = Record<string, unknown>;

// Props are reactive: read them in JSX or effects, don't destructure.
export interface WidgetProps<S extends WidgetSettings = WidgetSettings> {
  settings: S;
  size: WidgetSize;
  updateSettings: (patch: Partial<S>) => void;
}

export interface WidgetDefinition<S extends WidgetSettings = WidgetSettings> {
  // Namespaced and stable: it's persisted in the layout, e.g. "kit.clock".
  type: string;
  title: string;
  description: string;
  sizes: readonly WidgetSize[];
  defaultSize: WidgetSize;
  defaultSettings: S;
  component: Component<WidgetProps<S>>;
  // Rendered below the widget while customizing, if the widget has options.
  settingsComponent?: Component<WidgetProps<S>>;
}
