// SPDX-License-Identifier: MPL-2.0

// "Keyboard shortcuts": a read-only reference of Kit's key sequences, rendered
// by a small custom element inside the group's card.

import {
  NW_COMMAND_TITLES,
  type NWBindingSummary,
  summarizeBindings,
} from "../../../../browser-features/modules/common/NWKeymap.ts";
import type { PreferencesWindow } from "./types.ts";

export const KEY_BINDINGS_GROUP_ID = "kitKeyBindings";
const KEY_BINDINGS_ELEMENT = "kit-key-bindings";
const KEY_BINDINGS_SETTING_ID = "kitKeyBindingList";

function keyChip(doc: Document, keys: string): HTMLElement {
  const chip = doc.createElement("kbd");
  chip.className = "kit-key";
  chip.textContent = keys;
  return chip;
}

function bindingRow(doc: Document, summary: NWBindingSummary): HTMLElement {
  const row = doc.createElement("div");
  row.className = "kit-key-row";
  const title = doc.createElement("span");
  title.className = "kit-key-title";
  title.textContent = NW_COMMAND_TITLES[summary.command];
  const keys = doc.createElement("span");
  keys.className = "kit-key-sequences";
  for (const sequence of summary.keys) {
    keys.append(keyChip(doc, sequence));
  }
  row.append(title, keys);
  return row;
}

// The subscript runs with the preferences window as its global, so this
// registers with the page's own customElements and the settings framework
// can create it as a control.
function defineKeyBindingsElement(): void {
  if (customElements.get(KEY_BINDINGS_ELEMENT)) {
    return;
  }
  class KitKeyBindings extends HTMLElement {
    connectedCallback(): void {
      if (this.childElementCount > 0) {
        return;
      }
      const doc = this.ownerDocument;
      for (const summary of summarizeBindings()) {
        this.append(bindingRow(doc, summary));
      }
    }
  }
  // Gecko's CustomElementConstructor type expects a call signature classes lack.
  customElements.define(
    KEY_BINDINGS_ELEMENT,
    KitKeyBindings as unknown as CustomElementConstructor,
  );
}

export function registerKeyBindingsGroup(win: PreferencesWindow): void {
  defineKeyBindingsElement();
  win.Preferences.addSetting({ id: KEY_BINDINGS_SETTING_ID });
  win.SettingGroupManager.registerGroups({
    [KEY_BINDINGS_GROUP_ID]: {
      controlAttrs: {
        label: "Keyboard shortcuts",
        description: "Type these anywhere outside a text field. Changing them isn't possible yet.",
      },
      headingLevel: 2,
      items: [{ id: KEY_BINDINGS_SETTING_ID, control: KEY_BINDINGS_ELEMENT }],
    },
  });
}
