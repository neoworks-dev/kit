// SPDX-License-Identifier: MPL-2.0

import { createSignal, onCleanup, Show } from "solid-js";
import { Toggle } from "../../components/controls.tsx";
import { defineWidget } from "../registry.ts";
import type { WidgetProps } from "../types.ts";

type ClockSettings = {
  hour12: boolean;
  showDate: boolean;
};

function createNow() {
  const [now, setNow] = createSignal(new Date());
  // Tick on the minute boundary rather than polling every second.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    const current = new Date();
    setNow(current);
    timer = setTimeout(schedule, 60_000 - current.getSeconds() * 1000);
  };
  schedule();
  onCleanup(() => clearTimeout(timer));
  return now;
}

function Clock(props: WidgetProps<ClockSettings>) {
  const now = createNow();
  const time = () =>
    now().toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: props.settings.hour12,
    });
  const date = () =>
    now().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

  return (
    <div class="nw-on-photo flex flex-col items-center gap-1 py-2 text-center">
      <span
        class="font-semibold tracking-tight tabular-nums text-default"
        classList={{
          "text-6xl": props.size === "full",
          "text-4xl": props.size !== "full",
        }}
      >
        {time()}
      </span>
      <Show when={props.settings.showDate}>
        <span class="text-sm text-muted">{date()}</span>
      </Show>
    </div>
  );
}

function ClockSettingsPanel(props: WidgetProps<ClockSettings>) {
  return (
    <div class="flex flex-col gap-2">
      <Toggle
        label="12-hour time"
        checked={props.settings.hour12}
        onChange={(hour12) => props.updateSettings({ hour12 })}
      />
      <Toggle
        label="Show date"
        checked={props.settings.showDate}
        onChange={(showDate) => props.updateSettings({ showDate })}
      />
    </div>
  );
}

export const clockWidget = defineWidget<ClockSettings>({
  type: "kit.clock",
  title: "Clock",
  description: "The time and date.",
  sizes: ["small", "medium", "full"],
  defaultSize: "full",
  defaultSettings: { hour12: false, showDate: true },
  component: Clock,
  settingsComponent: ClockSettingsPanel,
});
