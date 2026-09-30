// SPDX-License-Identifier: MPL-2.0

import { type JSX, splitProps } from "solid-js";
import { cn } from "../lib/utils.ts";

// A Phosphor icon from neoworks-ui/icons.css, in the current text color.
export function Icon(props: { name: string; size?: number }) {
  return (
    <span
      class="nw-icon"
      data-icon={props.name}
      style={{ width: `${props.size ?? 16}px`, height: `${props.size ?? 16}px` }}
    />
  );
}

export function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label class="flex cursor-pointer items-center justify-between gap-4 text-sm text-muted">
      <span>{props.label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        class={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-120",
          props.checked ? "bg-action" : "bg-raised",
        )}
      >
        <span
          class={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full transition-transform duration-120",
            props.checked ? "translate-x-4 bg-action-fg" : "bg-muted",
          )}
        />
      </button>
    </label>
  );
}

export function TextInput(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <input
      {...rest}
      class={cn(
        "min-w-0 rounded-md border border-line bg-input px-3 py-1.5 text-sm text-default outline-none placeholder:text-faint focus:border-line-strong",
        local.class,
      )}
    />
  );
}

export function Button(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary";
  },
) {
  const [local, rest] = splitProps(props, ["class", "variant", "type"]);
  return (
    <button
      type={local.type ?? "button"}
      {...rest}
      class={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-120 disabled:opacity-50",
        local.variant === "primary"
          ? "bg-action text-action-fg hover:bg-action-hover"
          : "nw-glass border border-line bg-surface text-default hover:border-line-strong hover:bg-hover",
        local.class,
      )}
    />
  );
}

export function IconButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    icon: string;
  },
) {
  const [local, rest] = splitProps(props, ["class", "label", "icon"]);
  return (
    <button
      type="button"
      title={local.label}
      aria-label={local.label}
      {...rest}
      class={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-dim transition-colors duration-120 hover:bg-hover hover:text-default disabled:pointer-events-none disabled:opacity-30",
        local.class,
      )}
    >
      <Icon name={local.icon} size={14} />
    </button>
  );
}
