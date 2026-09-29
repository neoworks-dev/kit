// SPDX-License-Identifier: MPL-2.0

// Which-key hint: while a key sequence is pending (g, m, '), list the keys
// that can follow and what they do.

import { createSignal, For, Show } from "solid-js";
import {
  bindingsStartingWith,
  describeKeys,
  type NWCommandId,
} from "#features-modules/common/NWKeymap.ts";
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

const [pendingKeys, setPendingKeys] = createSignal<string[]>([]);
let showTimer: ReturnType<typeof setTimeout> | undefined;

function quickmarkJumpEntries(): WhichKeyEntry[] {
  const quickmarks = readQuickmarks();
  if (quickmarks.length === 0) {
    return [{ key: ANY_LETTER, title: "No quickmarks yet (set one with m)" }];
  }
  return quickmarks.map((quickmark) => ({ key: quickmark.letter, title: quickmark.title }));
}

function letterEntries(command: NWCommandId): WhichKeyEntry[] {
  if (command === "quickmark:jump") {
    return quickmarkJumpEntries();
  }
  return [{ key: ANY_LETTER, title: commandTitle(command) + " for this page" }];
}

// Letter bindings (26 quickmark slots) collapse into one entry per command.
function whichKeyEntries(typedKeys: string[]): WhichKeyEntry[] {
  const entries: WhichKeyEntry[] = [];
  const letterCommands = new Set<NWCommandId>();
  for (const binding of bindingsStartingWith(typedKeys)) {
    if (binding.letter) {
      letterCommands.add(binding.command);
      continue;
    }
    entries.push({ key: binding.keys[typedKeys.length], title: commandTitle(binding.command) });
  }
  for (const command of letterCommands) {
    entries.push(...letterEntries(command));
  }
  return entries;
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

export function WhichKey() {
  const entries = () => whichKeyEntries(pendingKeys());
  return (
    <div id="neoworks-which-key" class="nw-glass" data-open={openFlag()}>
      <style>{glassStyle + whichKeyStyle}</style>
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
