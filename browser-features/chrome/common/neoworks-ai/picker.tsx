// SPDX-License-Identifier: MPL-2.0

// A compact dropdown for the composer (harness, model). Native <select>
// options can't show icons, and a XUL menu is a native popup, so this is a
// plain HTML list that opens upward inside the sidebar.

import { createSignal, For, onCleanup, Show } from "solid-js";
import type { PickerOption } from "./types.ts";

function flag(enabled: boolean): string | undefined {
  return enabled ? "true" : undefined;
}

function OptionIcon(props: { icon: string | undefined }) {
  return (
    <Show when={props.icon}>
      {(icon) => <span class="nw-icon" data-icon={icon()} />}
    </Show>
  );
}

export function Picker(props: {
  title: string;
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const selected = () => props.options.find((option) => option.value === props.value);

  const root = (
    <div class="nw-ai-picker" data-open={flag(open())}>
      <button
        type="button"
        class="nw-ai-picker-button"
        title={props.title}
        onClick={() => setOpen(!open())}
      >
        <OptionIcon icon={selected()?.icon} />
        <span class="nw-ai-picker-label">{selected()?.label ?? props.title}</span>
        <span class="nw-icon nw-ai-picker-caret" data-icon="caret-down" />
      </button>
      <Show when={open()}>
        <div class="nw-ai-picker-menu">
          <For each={props.options}>
            {(option) => (
              <button
                type="button"
                class="nw-ai-picker-option"
                data-selected={flag(option.value === props.value)}
                onClick={() => {
                  setOpen(false);
                  props.onChange(option.value);
                }}
              >
                <OptionIcon icon={option.icon} />
                <span class="nw-ai-picker-label">{option.label}</span>
                <Show when={option.value === props.value}>
                  <span class="nw-icon nw-ai-picker-check" data-icon="check" />
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  ) as HTMLDivElement;

  // Clicking elsewhere or Escape closes the list.
  const closeOutside = (event: MouseEvent) => {
    if (open() && !root.contains(event.target as Node)) {
      setOpen(false);
    }
  };
  const closeOnEscape = (event: KeyboardEvent) => {
    if (open() && event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
    }
  };
  document.addEventListener("mousedown", closeOutside, true);
  root.addEventListener("keydown", closeOnEscape);
  onCleanup(() => document.removeEventListener("mousedown", closeOutside, true));

  return root;
}
