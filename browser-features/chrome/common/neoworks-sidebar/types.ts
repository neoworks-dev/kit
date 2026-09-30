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

// Firefox's <tab-split-view-wrapper>: the tabs shown together in a split view.
export interface BrowserSplitView extends XULElement {
  readonly tabs: BrowserTab[];
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
  // When the tab was last selected, in ms; Infinity while it is selected.
  lastAccessed: number;
  // Index in gBrowser.tabs.
  index: number;
  group: BrowserTabGroup | null;
  // Set while the tab is part of a split view.
  splitview: BrowserSplitView | null;
  linkedBrowser: {
    currentURI: { spec: string };
    canGoBack: boolean;
    canGoForward: boolean;
    // Null while the tab's browser isn't set up (e.g. an unloaded tab).
    browsingContext: {
      mediaController: MediaController;
      // Firefox's "app tab" flag for pinned tabs (pinned-navigation.ts).
      isAppTab: boolean;
    } | null;
  };
  toggleMuteAudio(): void;
}

// TabSelect's detail names the tab that was selected before.
export type TabSelectEvent = CustomEvent<{ previousTab?: BrowserTab }>;

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
  removeTab(
    tab: BrowserTab,
    options?: { animate?: boolean; skipSessionStore?: boolean },
  ): void;
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
  // Whether the container was made for this workspace: it is then renamed,
  // recolored and deleted along with it. False for a shared container.
  ownsContainer: boolean;
  // Phosphor icon name (one of WORKSPACE_ICONS) shown in the sidebar footer.
  icon: string;
}

export type SidebarEntry =
  | { kind: "tab"; tab: BrowserTab }
  | { kind: "group"; group: BrowserTabGroup }
  | { kind: "split"; split: BrowserSplitView };

export interface TabState {
  essentialTabs: () => BrowserTab[];
  // Pinned tabs that aren't Essentials.
  pinnedTabs: () => BrowserTab[];
  entries: () => SidebarEntry[];
  // Bumped on every tab event; read it to re-evaluate tab attributes.
  revision: () => number;
  dispose: () => void;
}

// A tab in SessionStore's list of recently closed tabs.
export interface ClosedTab {
  closedId: number;
  title: string;
  url: string;
  image: string;
}

// The tab whose media the sidebar's player controls.
export interface MediaSession {
  tab: BrowserTab;
  controller: MediaController;
}

// The row the hover preview card is shown for.
export interface TabPreviewTarget {
  tab: BrowserTab;
  anchor: Element;
}

// Firefox's PageThumbs, as exposed on the browser window.
export interface PageThumbs {
  // Draws the visible part of the page into `canvas`; false if the page
  // couldn't be captured (e.g. its browser went away).
  captureTabPreviewThumbnail(
    browser: BrowserTab["linkedBrowser"],
    canvas: HTMLCanvasElement,
  ): Promise<boolean>;
}
