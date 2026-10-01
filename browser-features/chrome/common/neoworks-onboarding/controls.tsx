// SPDX-License-Identifier: MPL-2.0

// Small controls shared by the setup's steps.

import { For, type JSX } from "solid-js";
import type { SettingOption } from "./types.ts";

export function attributeFlag(enabled: boolean): string | undefined {
  if (enabled) {
    return "true";
  }
  return undefined;
}

export function Segmented<T>(props: {
  label: string;
  options: SettingOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div class="nw-onboarding-segmented" role="radiogroup" aria-label={props.label}>
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            role="radio"
            aria-checked={option.value === props.value ? "true" : "false"}
            data-selected={attributeFlag(option.value === props.value)}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}

export function Toggle(props: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      class="nw-onboarding-switch"
      aria-label={props.label}
      aria-checked={props.checked ? "true" : "false"}
      data-checked={attributeFlag(props.checked)}
      onClick={() => props.onChange(!props.checked)}
    >
      <span class="nw-onboarding-switch-thumb" />
    </button>
  );
}

// A setting: title and description on the left, its control on the right,
// or below them when the control is wide.
export function SettingRow(props: {
  title: string;
  description: string;
  stacked?: boolean;
  children: JSX.Element;
}) {
  return (
    <div class="nw-onboarding-setting" data-stacked={attributeFlag(props.stacked === true)}>
      <div class="nw-onboarding-setting-text">
        <span class="nw-onboarding-setting-title">{props.title}</span>
        <span class="nw-onboarding-setting-description">{props.description}</span>
      </div>
      {props.children}
    </div>
  );
}
