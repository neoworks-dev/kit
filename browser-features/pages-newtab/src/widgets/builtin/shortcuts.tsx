// SPDX-License-Identifier: MPL-2.0

import { createResource, createSignal, For, Show } from "solid-js";
import {
  faviconUrl,
  getTopSites,
  hostname,
  type TopSite,
} from "../../lib/browser.ts";
import {
  Button,
  Icon,
  IconButton,
  TextInput,
  Toggle,
} from "../../components/controls.tsx";
import { defineWidget } from "../registry.ts";
import type { WidgetProps, WidgetSize } from "../types.ts";
import { mergeShortcuts, normalizeUrl, type ShortcutsSettings } from "./shortcuts-model.ts";

const COLUMNS: Record<WidgetSize, string> = {
  small: "grid-cols-1",
  medium: "grid-cols-2",
  full: "grid-cols-2 sm:grid-cols-4",
};

function Favicon(props: { url: string; title: string }) {
  const [failed, setFailed] = createSignal(false);
  return (
    <Show
      when={!failed()}
      fallback={
        <span class="flex size-4 shrink-0 items-center justify-center rounded-sm bg-raised text-[10px] font-semibold uppercase text-muted">
          {props.title.charAt(0)}
        </span>
      }
    >
      <img
        src={faviconUrl(props.url)}
        alt=""
        class="size-4 shrink-0"
        onError={() => setFailed(true)}
      />
    </Show>
  );
}

function Shortcuts(props: WidgetProps<ShortcutsSettings>) {
  const [frequent] = createResource(
    () => props.settings.showFrequent || undefined,
    () => getTopSites(),
    { initialValue: [] },
  );
  const shortcuts = () => mergeShortcuts(props.settings, frequent());

  const pin = (site: TopSite) =>
    props.updateSettings({ pinned: [...props.settings.pinned, site] });
  const unpin = (site: TopSite) =>
    props.updateSettings({
      pinned: props.settings.pinned.filter((s) => s.url !== site.url),
    });
  const hide = (site: TopSite) =>
    props.updateSettings({ hidden: [...props.settings.hidden, site.url] });

  return (
    <Show
      when={shortcuts().length > 0}
      fallback={
        <p class="py-3 text-center text-sm text-dim">
          No shortcuts yet. Pin sites while customizing.
        </p>
      }
    >
      <div class={`grid gap-3 ${COLUMNS[props.size]}`}>
        <For each={shortcuts()}>
          {(shortcut) => (
            <div class="group relative">
              <a
                href={shortcut.site.url}
                title={shortcut.site.url}
                class="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-default transition-colors duration-120 hover:border-line-strong hover:bg-hover"
              >
                <Favicon url={shortcut.site.url} title={shortcut.site.title} />
                <span class="truncate font-medium">{shortcut.site.title}</span>
              </a>
              <div class="absolute top-1/2 right-1.5 hidden -translate-y-1/2 gap-0.5 rounded-md bg-hover group-hover:flex">
                <Show
                  when={!shortcut.pinned}
                  fallback={
                    <IconButton
                      label="Unpin"
                      icon="x"
                      onClick={() => unpin(shortcut.site)}
                    />
                  }
                >
                  <IconButton
                    label="Pin"
                    icon="push-pin"
                    onClick={() => pin(shortcut.site)}
                  />
                  <IconButton
                    label="Remove"
                    icon="x"
                    onClick={() => hide(shortcut.site)}
                  />
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

function ShortcutsSettingsPanel(props: WidgetProps<ShortcutsSettings>) {
  const [url, setUrl] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  const add = (event: SubmitEvent) => {
    event.preventDefault();
    const normalized = normalizeUrl(url());
    if (!normalized) {
      setError("Enter a web address, e.g. example.com");
      return;
    }
    const site = {
      url: normalized,
      title: title().trim() || hostname(normalized),
    };
    props.updateSettings({
      pinned: [
        ...props.settings.pinned.filter((s) => s.url !== normalized),
        site,
      ],
      hidden: props.settings.hidden.filter((h) => h !== normalized),
    });
    setUrl("");
    setTitle("");
    setError(null);
  };

  return (
    <div class="flex flex-col gap-3">
      <form onSubmit={add} class="flex flex-col gap-2">
        <div class="flex gap-2">
          <TextInput
            class="flex-1"
            placeholder="Address"
            value={url()}
            onInput={(e) => setUrl(e.currentTarget.value)}
          />
          <TextInput
            class="flex-1"
            placeholder="Name (optional)"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
          />
          <Button type="submit" disabled={!url().trim()}>
            <Icon name="plus" size={14} />
            Pin
          </Button>
        </div>
        <Show when={error()}>
          <p class="text-xs text-red">{error()}</p>
        </Show>
      </form>
      <Toggle
        label="Fill with frequently visited sites"
        checked={props.settings.showFrequent}
        onChange={(showFrequent) => props.updateSettings({ showFrequent })}
      />
      <label class="flex items-center justify-between gap-4 text-sm text-muted">
        <span>Shortcuts shown</span>
        <TextInput
          type="number"
          min={1}
          max={24}
          class="w-16 text-right"
          value={props.settings.limit}
          onChange={(e) => {
            const limit = e.currentTarget.valueAsNumber;
            if (Number.isInteger(limit) && limit >= 1 && limit <= 24) {
              props.updateSettings({ limit });
            }
          }}
        />
      </label>
      <Show when={props.settings.hidden.length > 0}>
        <div class="flex items-center justify-between gap-4 text-sm text-muted">
          <span>
            {props.settings.hidden.length} removed{" "}
            {props.settings.hidden.length === 1 ? "site" : "sites"}
          </span>
          <Button onClick={() => props.updateSettings({ hidden: [] })}>
            Restore
          </Button>
        </div>
      </Show>
    </div>
  );
}

export const shortcutsWidget = defineWidget<ShortcutsSettings>({
  type: "kit.shortcuts",
  title: "Shortcuts",
  description: "Pinned and frequently visited sites.",
  sizes: ["small", "medium", "full"],
  defaultSize: "full",
  defaultSettings: { pinned: [], hidden: [], showFrequent: true, limit: 8 },
  component: Shortcuts,
  settingsComponent: ShortcutsSettingsPanel,
});
