// SPDX-License-Identifier: MPL-2.0

// Which-key hint: while a key sequence is pending (g, gw, m, '), list the keys
// that can follow and what they do.

import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { createPageBackdrop } from "../neoworks-ui/page-backdrop.ts";
import {
  bindingsStartingWith,
  describeKeys,
  type NWCommandId,
} from "#features-modules/common/NWKeymap.ts";
import { workspaces } from "../neoworks-sidebar/workspaces.ts";
import { readQuickmarks } from "./quickmarks.ts";
import { commandTitle } from "./registry.ts";
import glassStyle from "../neoworks-ui/glass.css?inline";
import whichKeyStyle from "./which-key.css?inline";

interface WhichKeyEntry {
  key: string;
  title: string;
}

// Avoids flashing the panel for sequences typed quickly (gg, gt).
const SHOW_DELAY_MS = 250;
const ANY_LETTER = "a–z";
const MAX_NUMBERED_WORKSPACES = 9;
// Titles for keys that lead to a further menu, keyed by the typed sequence.
const PREFIX_TITLES: Record<string, string> = {
  "g w": "Workspaces…",
};

const [pendingKeys, setPendingKeys] = createSignal<string[]>([]);
let showTimer: ReturnType<typeof setTimeout> | undefined;

function quickmarkJumpEntries(): WhichKeyEntry[] {
  const quickmarks = readQuickmarks();
  if (quickmarks.length === 0) {
    return [{ key: ANY_LETTER, title: "No quickmarks yet (set one with m)" }];
  }
  return quickmarks.map((quickmark) => ({ key: quickmark.letter, title: quickmark.title }));
}

// Numbered like the gw1–gw9 bindings.
function workspaceSwitchEntries(): WhichKeyEntry[] {
  return workspaces()
    .slice(0, MAX_NUMBERED_WORKSPACES)
    .map((workspace, index) => ({ key: String(index + 1), title: workspace.name }));
}

function letterEntries(command: NWCommandId): WhichKeyEntry[] {
  if (command === "quickmark:jump") {
    return quickmarkJumpEntries();
  }
  if (command === "workspace:switch") {
    return workspaceSwitchEntries();
  }
  return [{ key: ANY_LETTER, title: commandTitle(command) + " for this page" }];
}

function prefixTitle(prefix: string[]): string {
  const title = PREFIX_TITLES[describeKeys(prefix)];
  if (!title) {
    return "More…";
  }
  return title;
}

// Letter bindings (26 quickmark slots) collapse into one entry per command,
// and longer sequences (gw1, gwn) into one entry for their next key.
function whichKeyEntries(typedKeys: string[]): WhichKeyEntry[] {
  const commandEntries: WhichKeyEntry[] = [];
  const letterCommands = new Set<NWCommandId>();
  const prefixKeys = new Set<string>();
  for (const binding of bindingsStartingWith(typedKeys)) {
    const nextKey = binding.keys[typedKeys.length];
    if (binding.keys.length > typedKeys.length + 1) {
      prefixKeys.add(nextKey);
      continue;
    }
    if (binding.letter) {
      letterCommands.add(binding.command);
      continue;
    }
    commandEntries.push({ key: nextKey, title: commandTitle(binding.command) });
  }
  const letterCommandEntries = Array.from(letterCommands).flatMap(letterEntries);
  const prefixEntries = Array.from(prefixKeys).map((key) => ({
    key,
    title: prefixTitle([...typedKeys, key]),
  }));
  return [...letterCommandEntries, ...commandEntries, ...prefixEntries];
}

// Double Space is a gesture, not a menu.
function isHintWorthy(keys: string[]): boolean {
  return keys.length > 0 && keys[0] !== "Space";
}

export function showPendingKeys(keys: string[]): void {
  clearTimeout(showTimer);
  if (!isHintWorthy(keys)) {
    setPendingKeys([]);
    return;
  }
  showTimer = setTimeout(() => setPendingKeys(keys), SHOW_DELAY_MS);
}

export function hidePendingKeys(): void {
  showPendingKeys([]);
}

// solid-xul removes the attribute when the value is undefined.
function openFlag(): string | undefined {
  if (pendingKeys().length > 0) {
    return "true";
  }
  return undefined;
}

const PANEL_ID = "neoworks-which-key";
const BACKDROP_ID = "neoworks-which-key-backdrop";

export function WhichKey() {
  const entries = () => whichKeyEntries(pendingKeys());
  const backdrop = createPageBackdrop(PANEL_ID, BACKDROP_ID);
  createEffect(() => {
    if (pendingKeys().length > 0) {
      backdrop.start();
      return;
    }
    backdrop.stop();
  });
  onCleanup(() => backdrop.stop());

  return (
    <div id={PANEL_ID} class="nw-glass" data-open={openFlag()}>
      <style>{glassStyle + whichKeyStyle}</style>
      <canvas id={BACKDROP_ID} class="nw-glass-backdrop" />
      <Show when={pendingKeys().length > 0}>
        <div class="nw-which-key-typed">{describeKeys(pendingKeys())} …</div>
        <For each={entries()}>
          {(entry) => (
            <div class="nw-which-key-entry">
              <kbd class="nw-which-key-key">{entry.key}</kbd>
              <span class="nw-which-key-title">{entry.title}</span>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
