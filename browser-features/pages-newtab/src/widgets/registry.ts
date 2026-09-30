// SPDX-License-Identifier: MPL-2.0

// Widget types available to the new tab board. Built-ins register in
// builtin/index.ts; other sources (neoworks apps, third parties) register the
// same way and get an unregister function back, so they can unload cleanly.
// The layout only stores type ids, so an instance whose type isn't registered
// yet stays in the layout and renders once its type arrives.

import { createSignal } from "solid-js";
import type { WidgetDefinition, WidgetSettings } from "./types.ts";

const [definitions, setDefinitions] = createSignal<
  readonly WidgetDefinition[]
>([]);

// Erases the settings type so definitions of different widgets share one list.
export function defineWidget<S extends WidgetSettings>(
  definition: WidgetDefinition<S>,
): WidgetDefinition {
  return definition as unknown as WidgetDefinition;
}

export function registerWidget(definition: WidgetDefinition): () => void {
  if (getWidget(definition.type)) {
    throw new Error(`Widget type "${definition.type}" is already registered`);
  }
  if (!definition.sizes.includes(definition.defaultSize)) {
    throw new Error(
      `Widget type "${definition.type}" doesn't allow its default size`,
    );
  }
  setDefinitions((list) => [...list, definition]);
  return () => setDefinitions((list) => list.filter((d) => d !== definition));
}

// Reactive: tracked inside Solid computations.
export function getWidget(type: string): WidgetDefinition | undefined {
  return definitions().find((d) => d.type === type);
}

// Reactive: tracked inside Solid computations.
export function listWidgets(): readonly WidgetDefinition[] {
  return definitions();
}
