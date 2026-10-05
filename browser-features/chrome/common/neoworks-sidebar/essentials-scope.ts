// SPDX-License-Identifier: MPL-2.0

// Browser-independent rules for which workspaces an Essential shows in, kept
// apart from essentials.ts so they can be tested without tabs or prefs.

export const ESSENTIALS_SCOPE_PREF = "neoworks.essentials.scope";

export type EssentialsScope = "shared" | "workspace" | "container";

// What an Essential was tagged with when it was added. An empty string means
// the tag is missing or points at something that no longer exists; such an
// Essential belongs wherever you are and gets tagged on the spot.
export interface EssentialTag {
  workspaceId: string;
  containerId: string;
}

export interface ScopeWorkspace {
  id: string;
  userContextId: number;
}

export function parseEssentialsScope(value: unknown): EssentialsScope {
  if (value === "workspace" || value === "container") {
    return value;
  }
  return "shared";
}

export function containerTagOf(workspace: ScopeWorkspace): string {
  return String(workspace.userContextId);
}

export function essentialScope(
  tag: EssentialTag,
  workspace: ScopeWorkspace,
  scope: EssentialsScope,
): boolean {
  if (scope === "workspace") {
    return tag.workspaceId === "" || tag.workspaceId === workspace.id;
  }
  if (scope === "container") {
    return tag.containerId === "" || tag.containerId === containerTagOf(workspace);
  }
  return true;
}

// Whether deleting `deleted` leaves the Essential without any workspace it
// could show in. Takes the raw tag.
export function essentialOrphaned(
  tag: EssentialTag,
  deleted: ScopeWorkspace,
  remaining: ScopeWorkspace[],
  scope: EssentialsScope,
): boolean {
  if (scope === "workspace") {
    return tag.workspaceId === deleted.id;
  }
  if (scope === "container") {
    return tag.containerId === containerTagOf(deleted) &&
      !remaining.some((workspace) => workspace.userContextId === deleted.userContextId);
  }
  return false;
}
