// SPDX-License-Identifier: MPL-2.0

// Pinned web panels, shared by all windows through a pref; which one is open
// is up to each window.

import { createSignal } from "solid-js";
import { removePanelBrowser } from "./panel-browsers.ts";
import type { WebPanel } from "./types.ts";

const PANELS_PREF = "neoworks.webPanels";
export const DEFAULT_WIDTH = 400;
export const MIN_WIDTH = 280;
export const MAX_WIDTH = 800;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function clampWidth(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}

function parsePanel(value: unknown): WebPanel | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.url !== "string") {
    return null;
  }
  const width = typeof value.width === "number" ? clampWidth(value.width) : DEFAULT_WIDTH;
  return { id: value.id, url: value.url, width };
}

function readPanels(): WebPanel[] {
  try {
    const data: unknown = JSON.parse(Services.prefs.getStringPref(PANELS_PREF, "[]"));
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map(parsePanel).filter((panel): panel is WebPanel => panel !== null);
  } catch (error) {
    console.error("[neoworks-web-panels] The panel list is unreadable:", error);
    return [];
  }
}

const [panels, setPanels] = createSignal<WebPanel[]>(readPanels());
const [activeId, setActiveId] = createSignal<string | null>(null);
// The last panel shown here, so the toggle brings it back.
let lastActiveId: string | null = null;

export { activeId, panels };

function writePanels(next: WebPanel[]): void {
  Services.prefs.setStringPref(PANELS_PREF, JSON.stringify(next));
}

export function activePanel(): WebPanel | undefined {
  return panels().find((panel) => panel.id === activeId());
}

export function showPanel(id: string | null): void {
  setActiveId(id);
  if (id) {
    lastActiveId = id;
  }
}

export function togglePanel(id: string): void {
  showPanel(activeId() === id ? null : id);
}

// Closes the open panel, or brings back the last one (else the first).
export function toggleLastPanel(): void {
  if (activeId()) {
    showPanel(null);
    return;
  }
  const list = panels();
  const last = list.find((panel) => panel.id === lastActiveId);
  showPanel((last ?? list[0])?.id ?? null);
}

export function addPanel(url: string): string {
  const panel: WebPanel = { id: crypto.randomUUID(), url, width: DEFAULT_WIDTH };
  writePanels([...panels(), panel]);
  return panel.id;
}

export function removePanel(id: string): void {
  if (activeId() === id) {
    showPanel(null);
  }
  writePanels(panels().filter((panel) => panel.id !== id));
}

export function setPanelWidth(id: string, width: number): void {
  writePanels(
    panels().map((panel) => (panel.id === id ? { ...panel, width: clampWidth(width) } : panel)),
  );
}

// Returns a stop function for hot reload.
export function watchPanels(): () => void {
  const observer = {
    // Also when another window unpins a panel: its page stops here too.
    observe: () => {
      const next = readPanels();
      const kept = new Set(next.map((panel) => panel.id));
      for (const panel of panels()) {
        if (!kept.has(panel.id)) {
          removePanelBrowser(panel.id);
        }
      }
      setPanels(next);
      if (activeId() && !kept.has(activeId() ?? "")) {
        setActiveId(null);
      }
    },
  };
  Services.prefs.addObserver(PANELS_PREF, observer);
  return () => Services.prefs.removeObserver(PANELS_PREF, observer);
}
