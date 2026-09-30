// SPDX-License-Identifier: MPL-2.0

export interface BrowserTabGroup extends XULElement {
  id: string;
  label: string;
  color: string;
  collapsed: boolean;
  tabs: BrowserTab[];
  // Moves every tab out of the group, which then removes itself.
  ungroupTabs(): void;
}

// A top-level row in the tab list: a loose tab or a whole folder.
export type TabListElement = BrowserTab | BrowserTabGroup;

export interface BrowserTab extends Omit<XULElement, "linkedBrowser"> {
  label: string;
  image: string;
  pinned: boolean;
  selected: boolean;
  muted: boolean;
  closing: boolean;
  userContextId: number;
  // Index in gBrowser.tabs.
  index: number;
  group: BrowserTabGroup | null;
  linkedBrowser: { currentURI: { spec: string } };
  toggleMuteAudio(): void;
}

export interface WindowActor {
  sendAsyncMessage(name: string, data?: unknown): void;
}

export interface SelectedBrowser {
  focus(): void;
  currentURI: { spec: string };
  contentTitle: string;
  browsingContext: {
    currentWindowGlobal: { getActor(name: string): WindowActor } | null;
  } | null;
}

export interface NeoworksTabbrowser {
  tabs: BrowserTab[];
  nonHiddenTabs: BrowserTab[];
  selectedTab: BrowserTab;
  selectedBrowser: SelectedBrowser;
  tabContainer: EventTarget & {
    advanceSelectedTab(direction: number, wrap: boolean): void;
    _invalidateCachedVisibleTabs(): void;
  };
  addTrustedTab(
    url: string,
    options: { userContextId: number; pinned?: boolean; index?: number },
  ): BrowserTab;
  pinTab(tab: BrowserTab): void;
  unpinTab(tab: BrowserTab): void;
  removeTab(tab: BrowserTab, options?: { animate?: boolean }): void;
  reloadTab(tab: BrowserTab): void;
  duplicateTab(tab: BrowserTab): BrowserTab;
  moveTabTo(tab: BrowserTab, options: { tabIndex: number }): void;
  moveTabBefore(element: TabListElement, target: TabListElement): void;
  moveTabAfter(element: TabListElement, target: TabListElement): void;
  // Move the selected tab one step, entering and leaving folders on the way.
  moveTabForward(): void;
  moveTabBackward(): void;
  moveTabToExistingGroup(tab: BrowserTab, group: BrowserTabGroup): void;
  tabGroups: BrowserTabGroup[];
  addTabGroup(
    tabs: BrowserTab[],
    options: { label: string; insertBefore?: BrowserTab },
  ): BrowserTabGroup;
  removeTabGroup(group: BrowserTabGroup): Promise<void>;
  ungroupTab(tab: BrowserTab): void;
  replaceTabWithWindow(tab: BrowserTab): void;
  // hideTab is a no-op for pinned and selected tabs.
  hideTab(tab: BrowserTab): void;
  showTab(tab: BrowserTab): void;
}

export interface Workspace {
  id: string;
  name: string;
  // Firefox container color name, shared with the workspace's container.
  color: string;
  // Container new tabs in this workspace open in.
  userContextId: number;
}

export type SidebarEntry =
  | { kind: "tab"; tab: BrowserTab }
  | { kind: "group"; group: BrowserTabGroup };

export interface TabState {
  pinnedTabs: () => BrowserTab[];
  entries: () => SidebarEntry[];
  // Bumped on every tab event; read it to re-evaluate tab attributes.
  revision: () => number;
  dispose: () => void;
}
