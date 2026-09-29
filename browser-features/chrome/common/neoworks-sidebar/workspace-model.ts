// SPDX-License-Identifier: MPL-2.0

// Browser-independent workspace logic, kept apart from workspaces.ts so it
// can be tested without touching tabs or prefs.

import type { Workspace } from "./types.ts";

function isWorkspace(value: unknown): value is Workspace {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.color === "string" &&
    typeof candidate.userContextId === "number";
}

// Returns the stored workspaces, or `fallback` when the JSON is missing,
// malformed, empty or holds an invalid entry.
export function parseWorkspaces(json: string, fallback: Workspace[]): Workspace[] {
  let stored: unknown;
  try {
    stored = JSON.parse(json);
  } catch {
    return fallback;
  }
  if (!Array.isArray(stored) || stored.length === 0 || !stored.every(isWorkspace)) {
    return fallback;
  }
  return stored;
}

// Index `step` places away from `index`, wrapping around both ends.
export function cycleIndex(index: number, step: number, length: number): number {
  return (((index + step) % length) + length) % length;
}
