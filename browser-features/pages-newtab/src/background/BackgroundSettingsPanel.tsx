// SPDX-License-Identifier: MPL-2.0

import { type Accessor, Show } from "solid-js";
import { Toggle } from "../components/controls.tsx";
import type { BackgroundSettings } from "./types.ts";

// Shown with the add-widget list while customizing.
export function BackgroundSettingsPanel(props: {
  settings: Accessor<BackgroundSettings>;
  onChange: (patch: Partial<BackgroundSettings>) => void;
}) {
  return (
    <div class="col-span-4 flex flex-col gap-2">
      <span class="text-xs font-medium tracking-wide text-dim uppercase">
        Background
      </span>
      <div class="nw-glass flex flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
        <Toggle
          label="Photo from Unsplash"
          checked={props.settings().enabled}
          onChange={(enabled) => props.onChange({ enabled })}
        />
        <Show when={props.settings().enabled}>
          <Toggle
            label="New photo in every tab"
            checked={props.settings().shuffle}
            onChange={(shuffle) => props.onChange({ shuffle })}
          />
        </Show>
      </div>
    </div>
  );
}
