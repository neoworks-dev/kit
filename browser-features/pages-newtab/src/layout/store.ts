// SPDX-License-Identifier: MPL-2.0

import { getStringPref, setStringPref } from "../lib/prefs.ts";
import type { WidgetSize } from "../widgets/types.ts";
import type { NewTabLayout, WidgetInstance } from "./types.ts";

export const LAYOUT_PREF = "neoworks.newtab.layout";

const SIZES: readonly WidgetSize[] = ["small", "medium", "full"];

export function defaultLayout(): NewTabLayout {
  return {
    version: 1,
    widgets: [
      { id: "clock", type: "kit.clock", size: "full", settings: {} },
      { id: "search", type: "kit.search", size: "full", settings: {} },
      { id: "shortcuts", type: "kit.shortcuts", size: "full", settings: {} },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInstance(value: unknown): WidgetInstance | null {
  if (!isRecord(value)) return null;
  const { id, type, size, settings } = value;
  if (typeof id !== "string" || !id || typeof type !== "string" || !type) {
    return null;
  }
  return {
    id,
    type,
    size: SIZES.includes(size as WidgetSize) ? size as WidgetSize : "full",
    settings: isRecord(settings) ? settings : {},
  };
}

// Falls back to the default layout for anything it can't read, and drops
// malformed or duplicate widget entries.
export function parseLayout(raw: string | null): NewTabLayout {
  if (!raw) return defaultLayout();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return defaultLayout();
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.widgets)) {
    return defaultLayout();
  }
  const seen = new Set<string>();
  const widgets: WidgetInstance[] = [];
  for (const entry of value.widgets) {
    const instance = parseInstance(entry);
    if (instance && !seen.has(instance.id)) {
      seen.add(instance.id);
      widgets.push(instance);
    }
  }
  return { version: 1, widgets };
}

export function loadLayout(): NewTabLayout {
  try {
    return parseLayout(getStringPref(LAYOUT_PREF));
  } catch (e) {
    console.error("[NewTab] Failed to load layout:", e);
    return defaultLayout();
  }
}

export function saveLayout(layout: NewTabLayout): void {
  try {
    setStringPref(LAYOUT_PREF, JSON.stringify(layout));
  } catch (e) {
    console.error("[NewTab] Failed to save layout:", e);
  }
}

export function moveWidget(
  layout: NewTabLayout,
  id: string,
  offset: -1 | 1,
): NewTabLayout {
  const from = layout.widgets.findIndex((w) => w.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= layout.widgets.length) return layout;
  const widgets = [...layout.widgets];
  [widgets[from], widgets[to]] = [widgets[to], widgets[from]];
  return { ...layout, widgets };
}

export function updateWidget(
  layout: NewTabLayout,
  id: string,
  patch: Partial<Omit<WidgetInstance, "id" | "type">>,
): NewTabLayout {
  return {
    ...layout,
    widgets: layout.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
  };
}

export function removeWidget(layout: NewTabLayout, id: string): NewTabLayout {
  return { ...layout, widgets: layout.widgets.filter((w) => w.id !== id) };
}

export function addWidget(
  layout: NewTabLayout,
  type: string,
  size: WidgetSize,
): NewTabLayout {
  const taken = new Set(layout.widgets.map((w) => w.id));
  let n = 1;
  while (taken.has(`${type}-${n}`)) n++;
  const instance: WidgetInstance = { id: `${type}-${n}`, type, size, settings: {} };
  return { ...layout, widgets: [...layout.widgets, instance] };
}
