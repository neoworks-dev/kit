// SPDX-License-Identifier: MPL-2.0

// Kit workspaces: named sets of tabs, each with a dedicated container that new
// tabs open in. A tab belongs to the workspace it was opened in, whatever
// container it uses; the membership is stored on the tab through SessionStore
// so it survives restarts, and so does each window's active workspace. Only the active workspace's tabs are shown,
// pinned tabs included: each workspace has its own pinned grid. Essentials
// (essentials.ts) belong to every workspace.

import { createSignal } from "solid-js";
import {
  CONTAINER_COLORS,
  ContextualIdentityService,
  NO_CONTAINER,
  setDefaultContainerId,
} from "./containers.ts";
import { isEssential } from "./essentials.ts";
import { tabbrowser } from "./tabbrowser.ts";
import type { BrowserTab, Workspace } from "./types.ts";
import { removeFromSplit } from "../neoworks-split/split-view.ts";
import type { SplitTab } from "../neoworks-split/types.ts";
import {
  cycleIndex,
  DEFAULT_WORKSPACE,
  parseWorkspaces,
  workspaceAtNumber,
  WORKSPACES_PREF,
} from "./workspace-model.ts";

const ACTIVE_WORKSPACE_PREF = "neoworks.workspaces.active";
const TAB_WORKSPACE_KEY = "neoworksWorkspaceId";
const WINDOW_WORKSPACE_KEY = "neoworksActiveWorkspace";
const WORKSPACE_CONTAINER_ICON = "briefcase";
// Floorp's own workspaces also hide tabs; Kit's replace them.
const FLOORP_WORKSPACES_PREF = "floorp.workspaces.enabled";

interface SessionStoreApi {
  getCustomTabValue(tab: BrowserTab, key: string): string;
  setCustomTabValue(tab: BrowserTab, key: string, value: string): void;
  getCustomWindowValue(window: Window, key: string): string;
  setCustomWindowValue(window: Window, key: string, value: string): void;
}

const browserWindow = window as unknown as {
  SessionStore: SessionStoreApi;
  BROWSER_NEW_TAB_URL: string;
};

function readWorkspaces(): Workspace[] {
  return parseWorkspaces(Services.prefs.getStringPref(WORKSPACES_PREF, "[]"), [
    DEFAULT_WORKSPACE,
  ]);
}

const [workspaces, setWorkspaces] = createSignal<Workspace[]>(readWorkspaces());

export function workspaceById(id: string): Workspace | undefined {
  return workspaces().find((workspace) => workspace.id === id);
}

// SessionStore throws for a window it doesn't track yet, which is the case
// while Kit starts up.
function windowWorkspaceId(): string {
  try {
    return browserWindow.SessionStore.getCustomWindowValue(window, WINDOW_WORKSPACE_KEY);
  } catch {
    return "";
  }
}

function saveWindowWorkspaceId(id: string): void {
  try {
    browserWindow.SessionStore.setCustomWindowValue(window, WINDOW_WORKSPACE_KEY, id);
  } catch {
    // Saved again on the next switch; the pref covers new windows meanwhile.
  }
}

// The window's own workspace when SessionStore restored one; new windows
// open in the one that was active last in any window.
function readActiveWorkspaceId(): string {
  const candidates = [
    windowWorkspaceId(),
    Services.prefs.getStringPref(ACTIVE_WORKSPACE_PREF, ""),
  ];
  const id = candidates.find((candidate) => workspaceById(candidate));
  if (id) {
    return id;
  }
  return workspaces()[0].id;
}

const [activeWorkspaceId, setActiveWorkspaceId] = createSignal(readActiveWorkspaceId());

export { activeWorkspaceId, workspaces };

export function activeWorkspace(): Workspace {
  const workspace = workspaceById(activeWorkspaceId());
  if (workspace) {
    return workspace;
  }
  return workspaces()[0];
}

function saveWorkspaces(next: Workspace[]): void {
  setWorkspaces(next);
  Services.prefs.setStringPref(WORKSPACES_PREF, JSON.stringify(next));
}

// Tabs without a known workspace (opened before workspaces existed, or whose
// workspace was deleted) count as part of the active one, and so do
// Essentials.
function workspaceIdOf(tab: BrowserTab): string {
  if (isEssential(tab)) {
    return activeWorkspaceId();
  }
  const stored = browserWindow.SessionStore.getCustomTabValue(tab, TAB_WORKSPACE_KEY);
  if (stored && workspaceById(stored)) {
    return stored;
  }
  return activeWorkspaceId();
}

// For closed tabs: SessionStore keeps a tab's custom values in its extData.
export function isInActiveWorkspace(extData: Record<string, string> | undefined): boolean {
  const stored = extData?.[TAB_WORKSPACE_KEY];
  if (!stored || !workspaceById(stored)) {
    return true;
  }
  return stored === activeWorkspaceId();
}

function assignTab(tab: BrowserTab, workspaceId: string): void {
  browserWindow.SessionStore.setCustomTabValue(tab, TAB_WORKSPACE_KEY, workspaceId);
}

// A tab leaving the Essentials stays where you are.
export function claimForActiveWorkspace(tab: BrowserTab): void {
  assignTab(tab, activeWorkspaceId());
}

// Essentials excluded: they aren't the workspace's own.
function workspaceTabs(workspaceId: string): BrowserTab[] {
  return tabbrowser().tabs.filter((tab) =>
    !isEssential(tab) && workspaceIdOf(tab) === workspaceId
  );
}

// gBrowser.hideTab skips pinned tabs, so mirror what it does for them.
// SessionStore restores hidden pinned tabs the same way.
function hidePinnedTab(tab: BrowserTab): void {
  if (tab.hidden || tab.selected || tab.closing) {
    return;
  }
  tab.setAttribute("hidden", "true");
  tabbrowser().tabContainer._invalidateCachedVisibleTabs();
  tab.dispatchEvent(new Event("TabHide", { bubbles: true }));
}

function hideTab(tab: BrowserTab): void {
  if (tab.pinned) {
    hidePinnedTab(tab);
    return;
  }
  tabbrowser().hideTab(tab);
}

function applyVisibility(): void {
  const browser = tabbrowser();
  for (const tab of browser.tabs) {
    if (workspaceIdOf(tab) === activeWorkspaceId()) {
      browser.showTab(tab);
      continue;
    }
    hideTab(tab);
  }
}

function openTabIn(workspace: Workspace): BrowserTab {
  const tab = tabbrowser().addTrustedTab(browserWindow.BROWSER_NEW_TAB_URL, {
    userContextId: workspace.userContextId,
  });
  assignTab(tab, workspace.id);
  return tab;
}

// Opens `url` in a background tab of the workspace, which stays hidden
// unless the workspace is the active one.
export function openTabInWorkspace(workspaceId: string, url: string): BrowserTab {
  const workspace = workspaceById(workspaceId);
  if (!workspace) {
    throw new Error(`No workspace ${workspaceId}`);
  }
  const tab = tabbrowser().addTrustedTab(url, {
    userContextId: workspace.userContextId,
    inBackground: true,
  });
  assignTab(tab, workspace.id);
  applyVisibility();
  return tab;
}

// Switching back returns to the tab that was selected when the workspace was
// left: its most recently used one. SessionStore restores lastAccessed, so
// this holds across restarts.
function tabToSelectIn(workspace: Workspace): BrowserTab {
  const tabs = workspaceTabs(workspace.id);
  if (tabs.length === 0) {
    return openTabIn(workspace);
  }
  return tabs.reduce((latest, tab) => tab.lastAccessed > latest.lastAccessed ? tab : latest);
}

function activate(workspace: Workspace): void {
  setActiveWorkspaceId(workspace.id);
  Services.prefs.setStringPref(ACTIVE_WORKSPACE_PREF, workspace.id);
  saveWindowWorkspaceId(workspace.id);
  setDefaultContainerId(workspace.userContextId);
}

export function switchWorkspace(workspaceId: string): void {
  const target = workspaceById(workspaceId);
  if (!target || workspaceId === activeWorkspaceId()) {
    return;
  }
  const browser = tabbrowser();
  activate(target);
  // Select first: hideTab skips the selected tab.
  browser.selectedTab = tabToSelectIn(target);
  applyVisibility();
}

export function switchWorkspaceBy(step: number): void {
  const list = workspaces();
  const index = list.findIndex((workspace) => workspace.id === activeWorkspaceId());
  const next = list[cycleIndex(index, step, list.length)];
  switchWorkspace(next.id);
}

export function switchWorkspaceByNumber(number: string | undefined): void {
  if (!number) {
    return;
  }
  const target = workspaceAtNumber(workspaces(), number);
  if (target) {
    switchWorkspace(target.id);
  }
}

// The tab keeps its container and whether it is pinned, and goes to the end
// of the target's list. It leaves its folder and split view, which stay here.
// Essentials belong to every workspace, so they don't move.
export function moveTabToWorkspace(tab: BrowserTab, workspaceId: string): void {
  if (!workspaceById(workspaceId) || isEssential(tab) || workspaceIdOf(tab) === workspaceId) {
    return;
  }
  const browser = tabbrowser();
  removeFromSplit(tab as SplitTab);
  browser.ungroupTab(tab);
  const last = workspaceTabs(workspaceId).filter((other) => other.pinned === tab.pinned).at(-1);
  if (last) {
    browser.moveTabAfter(tab, last.group ?? last);
  }
  assignTab(tab, workspaceId);
  if (tab.selected) {
    // hideTab skips the selected tab.
    browser.selectedTab = tabToSelectIn(activeWorkspace());
  }
  applyVisibility();
}

// Opens new tabs in a container of its own, or pass an existing container
// (or NO_CONTAINER) to share that instead.
export function createWorkspace(
  name: string,
  icon: string,
  sharedContainerId: number | null,
): void {
  switchWorkspace(addWorkspace(name, icon, sharedContainerId).id);
}

// createWorkspace without switching to it, e.g. for imported tabs.
export function addWorkspace(
  name: string,
  icon: string,
  sharedContainerId: number | null,
): Workspace {
  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name,
    color: CONTAINER_COLORS[workspaces().length % CONTAINER_COLORS.length],
    userContextId: NO_CONTAINER,
    ownsContainer: sharedContainerId === null,
    icon,
  };
  if (sharedContainerId === null) {
    workspace.userContextId = ContextualIdentityService.create(
      name,
      WORKSPACE_CONTAINER_ICON,
      workspace.color,
    ).userContextId;
  } else {
    workspace.userContextId = sharedContainerId;
    const shared = ContextualIdentityService.getPublicIdentityFromId(sharedContainerId);
    if (shared) {
      workspace.color = shared.color;
    }
  }
  saveWorkspaces([...workspaces(), workspace]);
  return workspace;
}

// Keeps the dedicated container's name and color in sync with the workspace.
function updateWorkspaceContainer(workspace: Workspace): void {
  if (!workspace.ownsContainer || workspace.userContextId === NO_CONTAINER) {
    return;
  }
  const identity = ContextualIdentityService.getPublicIdentityFromId(workspace.userContextId);
  if (!identity) {
    return;
  }
  ContextualIdentityService.update(
    workspace.userContextId,
    workspace.name,
    identity.icon,
    workspace.color,
  );
}

export function updateWorkspace(workspace: Workspace): void {
  saveWorkspaces(
    workspaces().map((existing) => {
      if (existing.id === workspace.id) {
        return workspace;
      }
      return existing;
    }),
  );
  updateWorkspaceContainer(workspace);
  if (workspace.id === activeWorkspaceId()) {
    setDefaultContainerId(workspace.userContextId);
  }
}

async function removeWorkspaceContainer(workspace: Workspace): Promise<void> {
  if (!workspace.ownsContainer || workspace.userContextId === NO_CONTAINER) {
    return;
  }
  await ContextualIdentityService.closeContainerTabs(workspace.userContextId);
  ContextualIdentityService.remove(workspace.userContextId);
}

function confirmDeletion(workspace: Workspace): boolean {
  let message = `Delete "${workspace.name}"? Its tabs are closed.`;
  if (workspace.ownsContainer && workspace.userContextId !== NO_CONTAINER) {
    message = `Delete "${workspace.name}"? Its tabs are closed and its container's cookies and site data are removed.`;
  }
  return Services.prompt.confirm(
    window as unknown as mozIDOMWindowProxy,
    "Delete workspace",
    message,
  );
}

// The last workspace can't be deleted.
export async function deleteWorkspace(workspace: Workspace): Promise<void> {
  const remaining = workspaces().filter((existing) => existing.id !== workspace.id);
  if (remaining.length === 0 || !confirmDeletion(workspace)) {
    return;
  }
  if (workspace.id === activeWorkspaceId()) {
    switchWorkspace(remaining[0].id);
  }
  for (const tab of workspaceTabs(workspace.id)) {
    tabbrowser().removeTab(tab, { animate: false });
  }
  saveWorkspaces(remaining);
  await removeWorkspaceContainer(workspace);
}

function handleTabOpen(event: Event): void {
  const tab = event.target as BrowserTab;
  if (!browserWindow.SessionStore.getCustomTabValue(tab, TAB_WORKSPACE_KEY)) {
    assignTab(tab, activeWorkspaceId());
  }
}

interface TabSelectEvent extends Event {
  detail?: { previousTab?: BrowserTab };
}

// Closing a workspace's last tab makes Firefox select a tab from another
// workspace (it picks the successor before TabClose fires). Stay in the
// workspace on a fresh tab instead.
function leftByClosingLastTab(event: TabSelectEvent): boolean {
  const previousTab = event.detail?.previousTab;
  if (!previousTab || !previousTab.closing) {
    return false;
  }
  return workspaceIdOf(previousTab) === activeWorkspaceId();
}

// Selecting a hidden tab (e.g. from the spotlight) moves to its workspace.
function followSelectedTab(event?: TabSelectEvent): void {
  const browser = tabbrowser();
  const workspace = workspaceById(workspaceIdOf(browser.selectedTab));
  if (!workspace || workspace.id === activeWorkspaceId()) {
    return;
  }
  if (event && leftByClosingLastTab(event)) {
    browser.selectedTab = openTabIn(activeWorkspace());
    applyVisibility();
    return;
  }
  activate(workspace);
  applyVisibility();
}

// Session restore brings back the window's workspace after Kit has started
// with the last active one.
function restoreWindowWorkspace(): void {
  const id = windowWorkspaceId();
  if (workspaceById(id)) {
    switchWorkspace(id);
  } else {
    saveWindowWorkspaceId(activeWorkspaceId());
  }
  adoptUnassignedTabs();
  applyVisibility();
}

function adoptUnassignedTabs(): void {
  for (const tab of tabbrowser().tabs) {
    if (!browserWindow.SessionStore.getCustomTabValue(tab, TAB_WORKSPACE_KEY)) {
      assignTab(tab, activeWorkspaceId());
    }
  }
}

// Other windows and Kit's settings pane edit the same list; the active
// workspace stays per window. The settings pane can change which container
// the active workspace opens new tabs in.
const workspacesObserver = {
  observe(): void {
    setWorkspaces(readWorkspaces());
    if (!workspaceById(activeWorkspaceId())) {
      switchWorkspace(workspaces()[0].id);
      return;
    }
    setDefaultContainerId(activeWorkspace().userContextId);
  },
};

// Returns a stop function for hot reload.
export function watchWorkspaces(): () => void {
  Services.prefs.setBoolPref(FLOORP_WORKSPACES_PREF, false);
  Services.prefs.addObserver(WORKSPACES_PREF, workspacesObserver);
  const tabContainer = tabbrowser().tabContainer;
  tabContainer.addEventListener("TabOpen", handleTabOpen);
  tabContainer.addEventListener("TabSelect", followSelectedTab);
  // Restored tabs get their stored workspace after TabOpen.
  tabContainer.addEventListener("SSTabRestoring", applyVisibility);
  globalThis.addEventListener("SSWindowRestored", restoreWindowWorkspace);

  adoptUnassignedTabs();
  activate(activeWorkspace());
  followSelectedTab();
  applyVisibility();

  return () => {
    Services.prefs.removeObserver(WORKSPACES_PREF, workspacesObserver);
    tabContainer.removeEventListener("TabOpen", handleTabOpen);
    tabContainer.removeEventListener("TabSelect", followSelectedTab);
    tabContainer.removeEventListener("SSTabRestoring", applyVisibility);
    globalThis.removeEventListener("SSWindowRestored", restoreWindowWorkspace);
  };
}
