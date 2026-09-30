// SPDX-License-Identifier: MPL-2.0

import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { Backdrop } from "./background/Backdrop.tsx";
import { BackgroundSettingsPanel } from "./background/BackgroundSettingsPanel.tsx";
import { createBackgroundSettings } from "./background/settings.ts";
import { AddWidget } from "./components/AddWidget.tsx";
import { Button, Icon } from "./components/controls.tsx";
import { WidgetFrame } from "./components/WidgetFrame.tsx";
import { createLayout } from "./layout/createLayout.ts";
import {
  addWidget,
  moveWidget,
  removeWidget,
  updateWidget,
} from "./layout/store.ts";
import { getWidget, listWidgets } from "./widgets/registry.ts";

export default function App() {
  const [editing, setEditing] = createSignal(false);
  const { layout, update } = createLayout(editing);
  const background = createBackgroundSettings();

  createEffect(() => {
    if (!editing()) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditing(false);
    };
    addEventListener("keydown", onKey);
    onCleanup(() => removeEventListener("keydown", onKey));
  });

  return (
    <main class="flex min-h-screen items-center justify-center px-6 py-16">
      <Backdrop settings={background.settings} />
      <div class="grid w-full max-w-3xl grid-cols-4 gap-x-4 gap-y-6">
        {/* Keyed by id, so a widget keeps its state when its settings change. */}
        <For each={layout().widgets.map((w) => w.id)}>
          {(id, index) => {
            const instance = () => layout().widgets.find((w) => w.id === id);
            return (
              <Show when={instance()}>
                {(current) => (
                  <WidgetFrame
                    instance={current()}
                    definition={getWidget(current().type)}
                    editing={editing()}
                    isFirst={index() === 0}
                    isLast={index() === layout().widgets.length - 1}
                    onChange={(patch) =>
                      update((l) => updateWidget(l, id, patch))}
                    onMove={(offset) => update((l) => moveWidget(l, id, offset))}
                    onRemove={() => update((l) => removeWidget(l, id))}
                  />
                )}
              </Show>
            );
          }}
        </For>
        <Show when={editing()}>
          <AddWidget
            definitions={listWidgets()}
            onAdd={(definition) =>
              update((l) =>
                addWidget(l, definition.type, definition.defaultSize)
              )}
          />
        </Show>
        <Show when={editing()}>
          <BackgroundSettingsPanel
            settings={background.settings}
            onChange={background.update}
          />
        </Show>
        <Show when={!editing() && layout().widgets.length === 0}>
          <p class="col-span-4 text-center text-sm text-dim">
            Nothing here. Customize to add widgets.
          </p>
        </Show>
      </div>
      <div class="fixed right-4 bottom-4">
        <Show
          when={editing()}
          fallback={
            <Button
              onClick={() => setEditing(true)}
              class="border-transparent bg-transparent text-dim hover:text-default"
            >
              <Icon name="sliders" size={14} />
              Customize
            </Button>
          }
        >
          <Button variant="primary" onClick={() => setEditing(false)}>
            <Icon name="check" size={14} />
            Done
          </Button>
        </Show>
      </div>
    </main>
  );
}
