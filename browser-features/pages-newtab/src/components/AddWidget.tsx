// SPDX-License-Identifier: MPL-2.0

import { For, Show } from "solid-js";
import type { WidgetDefinition } from "../widgets/types.ts";
import { Icon } from "./controls.tsx";

export function AddWidget(props: {
  definitions: readonly WidgetDefinition[];
  onAdd: (definition: WidgetDefinition) => void;
}) {
  return (
    <Show when={props.definitions.length > 0}>
      <div class="col-span-4 flex flex-col gap-2">
        <span class="text-xs font-medium tracking-wide text-dim uppercase">
          Add widget
        </span>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <For each={props.definitions}>
            {(definition) => (
              <button
                type="button"
                onClick={() => props.onAdd(definition)}
                class="flex items-start gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors duration-120 hover:border-line-strong hover:bg-hover"
              >
                <span class="mt-0.5 text-dim">
                  <Icon name="plus" size={14} />
                </span>
                <span class="flex min-w-0 flex-col">
                  <span class="truncate text-sm font-medium text-default">
                    {definition.title}
                  </span>
                  <span class="truncate text-xs text-dim">
                    {definition.description}
                  </span>
                </span>
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
