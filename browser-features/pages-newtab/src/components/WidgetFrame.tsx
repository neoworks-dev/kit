// SPDX-License-Identifier: MPL-2.0

import { createSignal, ErrorBoundary, For, Show } from "solid-js";
import type { WidgetInstance } from "../layout/types.ts";
import { cn } from "../lib/utils.ts";
import type {
  WidgetDefinition,
  WidgetProps,
  WidgetSettings,
  WidgetSize,
} from "../widgets/types.ts";
import { IconButton } from "./controls.tsx";

const SPAN: Record<WidgetSize, string> = {
  small: "col-span-4 sm:col-span-1",
  medium: "col-span-4 sm:col-span-2",
  full: "col-span-4",
};

const SIZE_LABEL: Record<WidgetSize, string> = {
  small: "S",
  medium: "M",
  full: "L",
};

export function WidgetFrame(props: {
  instance: WidgetInstance;
  // Undefined while the widget's type isn't registered.
  definition: WidgetDefinition | undefined;
  editing: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<Pick<WidgetInstance, "size" | "settings">>) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  const size = (): WidgetSize => {
    const definition = props.definition;
    if (!definition) return "full";
    return definition.sizes.includes(props.instance.size)
      ? props.instance.size
      : definition.defaultSize;
  };

  // Getters keep the props reactive inside the widget.
  const widgetProps = (definition: WidgetDefinition): WidgetProps => ({
    get settings(): WidgetSettings {
      return { ...definition.defaultSettings, ...props.instance.settings };
    },
    get size() {
      return size();
    },
    updateSettings: (patch) =>
      props.onChange({ settings: { ...props.instance.settings, ...patch } }),
  });

  return (
    // An unregistered widget stays in the layout; it only shows while
    // customizing, so it can be removed.
    <Show when={props.definition || props.editing}>
      <section
        class={cn(
          SPAN[size()],
          props.editing &&
            "flex flex-col gap-3 rounded-xl border border-dashed border-line-strong p-3",
        )}
      >
        <Show when={props.editing}>
          <header class="flex items-center gap-2">
            <span class="flex-1 truncate text-sm font-medium text-muted">
              {props.definition?.title ??
                `Unavailable widget (${props.instance.type})`}
            </span>
            <Show when={(props.definition?.sizes.length ?? 0) > 1}>
              <div class="flex rounded-md border border-line p-0.5">
                <For each={props.definition?.sizes}>
                  {(s) => (
                    <button
                      type="button"
                      title={`Size ${SIZE_LABEL[s]}`}
                      onClick={() => props.onChange({ size: s })}
                      class={cn(
                        "h-6 w-6 rounded-sm text-xs font-medium transition-colors duration-120",
                        s === size()
                          ? "bg-raised text-default"
                          : "text-dim hover:text-default",
                      )}
                    >
                      {SIZE_LABEL[s]}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <Show when={props.definition?.settingsComponent}>
              <IconButton
                label="Widget settings"
                icon="sliders"
                onClick={() => setSettingsOpen((open) => !open)}
                class={cn(settingsOpen() && "bg-raised text-default")}
              />
            </Show>
            <IconButton
              label="Move up"
              icon="arrow-up"
              disabled={props.isFirst}
              onClick={() => props.onMove(-1)}
            />
            <IconButton
              label="Move down"
              icon="arrow-down"
              disabled={props.isLast}
              onClick={() => props.onMove(1)}
            />
            <IconButton
              label="Remove widget"
              icon="trash"
              onClick={() => props.onRemove()}
            />
          </header>
        </Show>
        <Show when={props.definition} keyed>
          {(definition) => (
            // Keeps one broken widget from taking down the page.
            <ErrorBoundary
              fallback={(error) => {
                console.error(
                  `[NewTab] Widget "${definition.type}" crashed:`,
                  error,
                );
                return (
                  <p class="py-3 text-center text-sm text-dim">
                    This widget stopped working.
                  </p>
                );
              }}
            >
              <definition.component {...widgetProps(definition)} />
              <Show
                when={props.editing && settingsOpen() &&
                  definition.settingsComponent}
              >
                {(settings) => {
                  const Settings = settings();
                  return (
                    <div class="nw-glass mt-3 rounded-lg border border-line bg-elevated p-3">
                      <Settings {...widgetProps(definition)} />
                    </div>
                  );
                }}
              </Show>
            </ErrorBoundary>
          )}
        </Show>
      </section>
    </Show>
  );
}
