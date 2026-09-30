// SPDX-License-Identifier: MPL-2.0

// Browser-independent workspace logic, kept apart from workspaces.ts so it
// can be tested without touching tabs or prefs. Kit's settings pane
// (bridge/startup/src/kit-preferences) shares it.

import type { Workspace } from "./types.ts";

export const WORKSPACES_PREF = "neoworks.workspaces";

// Used until the first workspace is created; keeps tabs without a container
// (userContextId 0).
export const DEFAULT_WORKSPACE: Workspace = {
  id: "default",
  name: "Default",
  color: "blue",
  userContextId: 0,
  ownsContainer: false,
  icon: "house",
};

// Workspaces stored before icons existed.
const FALLBACK_ICON = "briefcase";

function isWorkspace(value: unknown): value is Workspace {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.color === "string" &&
    typeof candidate.userContextId === "number" &&
    (candidate.icon === undefined || typeof candidate.icon === "string") &&
    (candidate.ownsContainer === undefined || typeof candidate.ownsContainer === "boolean");
}

function defaultIcon(workspace: Workspace): string {
  if (workspace.id === DEFAULT_WORKSPACE.id) {
    return DEFAULT_WORKSPACE.icon;
  }
  return FALLBACK_ICON;
}

// Fills in fields added after a workspace was stored. Workspaces used to
// always get a container of their own.
function withNewerFields(workspace: Workspace): Workspace {
  return {
    ...workspace,
    icon: workspace.icon || defaultIcon(workspace),
    ownsContainer: workspace.ownsContainer ?? workspace.userContextId !== 0,
  };
}

// Returns the stored workspaces, or `fallback` when the JSON is missing,
// malformed, empty or holds an invalid entry. Entries stored by an older Kit
// get the fields added since.
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
  return stored.map(withNewerFields);
}

// The list with one workspace opening new tabs in another container, which
// it then shares rather than owns.
export function withWorkspaceContainer(
  workspaces: Workspace[],
  workspaceId: string,
  userContextId: number,
): Workspace[] {
  return workspaces.map((workspace) => {
    if (workspace.id !== workspaceId) {
      return workspace;
    }
    if (workspace.userContextId === userContextId) {
      return workspace;
    }
    return { ...workspace, userContextId, ownsContainer: false };
  });
}

// Workspaces are numbered from 1 in list order, as in `g1`.
export function workspaceAtNumber(
  workspaces: Workspace[],
  number: string,
): Workspace | undefined {
  const index = Number.parseInt(number, 10) - 1;
  if (Number.isNaN(index) || index < 0) {
    return undefined;
  }
  return workspaces[index];
}

// Index `step` places away from `index`, wrapping around both ends.
export function cycleIndex(index: number, step: number, length: number): number {
  return (((index + step) % length) + length) % length;
}
