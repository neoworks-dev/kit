// SPDX-License-Identifier: MPL-2.0

// Essentials: up to nine sites you always keep open, shown as large tiles at
// the top of the sidebar. An Essential is a pinned tab with a flag stored
// through SessionStore, so it survives restarts; unpinning it drops the flag.
// The neoworks.essentials.scope pref decides where they show: in every
// workspace (shared), only in the workspace they were added in, or in every
// workspace that uses the container of the one they were added in. The
// workspace and container are stored as tags when the tab is added; the tab
// itself keeps running in its own container.

import {
  containerTagOf,
  essentialOrphaned,
  essentialScope,
  type EssentialsScope,
  ESSENTIALS_SCOPE_PREF,
  type EssentialTag,
  parseEssentialsScope,
} from "./essentials-scope.ts";
import { tabbrowser } from "./tabbrowser.ts";
import {
  activeWorkspace,
  assignTabToWorkspace,
  claimForActiveWorkspace,
  storedWorkspaceId,
  workspaceById,
  workspaces,
} from "./workspaces.ts";
import type { BrowserTab, Workspace } from "./types.ts";

export const MAX_ESSENTIALS = 9;

const ESSENTIAL_KEY = "neoworksEssential";
// The container of the workspace the Essential was added in; the workspace
// itself is the tab's usual workspace id.
const CONTAINER_KEY = "neoworksEssentialContainer";

interface SessionStoreApi {
  getCustomTabValue(tab: BrowserTab, key: string): string;
  setCustomTabValue(tab: BrowserTab, key: string, value: string): void;
  deleteCustomTabValue(tab: BrowserTab, key: string): void;
}

const browserWindow = window as unknown as { SessionStore: SessionStoreApi };

export function isEssential(tab: BrowserTab): boolean {
  return browserWindow.SessionStore.getCustomTabValue(tab, ESSENTIAL_KEY) === "true";
}

export function essentialsScope(): EssentialsScope {
  return parseEssentialsScope(Services.prefs.getStringPref(ESSENTIALS_SCOPE_PREF, "shared"));
}

function storedContainerTag(tab: BrowserTab): string {
  return browserWindow.SessionStore.getCustomTabValue(tab, CONTAINER_KEY);
}

// Essentials from before scopes (no container tag) and ones whose workspace or
// container is gone have empty tags and belong wherever you are.
function effectiveTag(tab: BrowserTab): EssentialTag {
  const containerId = storedContainerTag(tab);
  if (!containerId) {
    return { workspaceId: "", containerId: "" };
  }
  const workspaceId = storedWorkspaceId(tab);
  return {
    workspaceId: workspaceById(workspaceId) ? workspaceId : "",
    containerId: workspaces().some((workspace) => containerTagOf(workspace) === containerId)
      ? containerId
      : "",
  };
}

export function essentialTabs(): BrowserTab[] {
  return tabbrowser().tabs.filter(isEssential);
}

export function essentialBelongsTo(tab: BrowserTab, workspace: Workspace): boolean {
  return essentialScope(effectiveTag(tab), workspace, essentialsScope());
}

// The workspace an Essential counts as part of: the active one when it shows
// there, otherwise one it does show in, so selecting it switches there.
export function essentialWorkspaceId(tab: BrowserTab): string {
  const active = activeWorkspace();
  if (essentialBelongsTo(tab, active)) {
    return active.id;
  }
  const tag = effectiveTag(tab);
  if (essentialsScope() === "workspace") {
    return tag.workspaceId;
  }
  const owner = workspaces().find((workspace) => containerTagOf(workspace) === tag.containerId);
  return owner?.id ?? active.id;
}

function essentialsIn(workspace: Workspace, except?: BrowserTab): BrowserTab[] {
  return essentialTabs().filter((tab) => tab !== except && essentialBelongsTo(tab, workspace));
}

// Whether `workspace`'s Essentials have room for another. After switching the
// scope a set can hold more than the maximum; it stays visible but doesn't
// grow.
export function hasRoomForEssential(workspace: Workspace, except?: BrowserTab): boolean {
  return essentialsIn(workspace, except).length < MAX_ESSENTIALS;
}

function tagEssential(tab: BrowserTab, workspace: Workspace): void {
  assignTabToWorkspace(tab, workspace.id);
  browserWindow.SessionStore.setCustomTabValue(tab, CONTAINER_KEY, containerTagOf(workspace));
}

// Essentials from before scopes are tagged with the workspace you are in once
// the scope separates them.
export function tagLegacyEssentials(): void {
  if (essentialsScope() === "shared") {
    return;
  }
  for (const tab of essentialTabs()) {
    if (!storedContainerTag(tab)) {
      tagEssential(tab, activeWorkspace());
    }
  }
}

// Essentials can move between workspaces unless they are shared by all.
// Returns false when it didn't move.
export function moveEssential(tab: BrowserTab, target: Workspace): boolean {
  if (!isEssential(tab) || essentialsScope() === "shared") {
    return false;
  }
  if (!essentialBelongsTo(tab, target) && !hasRoomForEssential(target, tab)) {
    return false;
  }
  tagEssential(tab, target);
  announceChange(tab);
  return true;
}

// Essentials that go away with `deleted` (it was the last place they showed).
export function essentialsOrphanedBy(deleted: Workspace, remaining: Workspace[]): BrowserTab[] {
  const scope = essentialsScope();
  return essentialTabs().filter((tab) =>
    essentialOrphaned(
      { workspaceId: storedWorkspaceId(tab), containerId: storedContainerTag(tab) },
      deleted,
      remaining,
      scope,
    )
  );
}

// The sidebar re-reads tabs on TabAttrModified.
function announceChange(tab: BrowserTab): void {
  tab.dispatchEvent(
    new CustomEvent("TabAttrModified", {
      bubbles: true,
      detail: { changed: ["nw-essential"] },
    }),
  );
}

// Returns false when the active workspace's Essentials are full.
export function addToEssentials(tab: BrowserTab): boolean {
  if (isEssential(tab)) {
    return true;
  }
  const workspace = activeWorkspace();
  if (!hasRoomForEssential(workspace)) {
    return false;
  }
  browserWindow.SessionStore.setCustomTabValue(tab, ESSENTIAL_KEY, "true");
  tagEssential(tab, workspace);
  if (!tab.pinned) {
    tabbrowser().pinTab(tab);
  }
  announceChange(tab);
  return true;
}

// The tab stays pinned, in the workspace you're in.
export function removeFromEssentials(tab: BrowserTab): void {
  if (!isEssential(tab)) {
    return;
  }
  browserWindow.SessionStore.deleteCustomTabValue(tab, ESSENTIAL_KEY);
  browserWindow.SessionStore.deleteCustomTabValue(tab, CONTAINER_KEY);
  claimForActiveWorkspace(tab);
  announceChange(tab);
}

function handleUnpinned(event: Event): void {
  removeFromEssentials(event.target as unknown as BrowserTab);
}

// Returns a stop function for hot reload.
export function watchEssentials(): () => void {
  const tabContainer = tabbrowser().tabContainer;
  tabContainer.addEventListener("TabUnpinned", handleUnpinned);
  return () => tabContainer.removeEventListener("TabUnpinned", handleUnpinned);
}
