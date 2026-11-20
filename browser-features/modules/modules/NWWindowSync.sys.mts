// SPDX-License-Identifier: MPL-2.0

// Window sync: every normal Kit window shows the same tabs, folders, splits
// and Essentials, in the same order. Each window keeps its own selected tab
// and active workspace (neoworks-sidebar/workspaces.ts hides the others').
//
// A tab exists once per window. Its page lives in only one of them, the
// holder; in the others the tab is a mirror, an unloaded tab on about:blank
// that copies the holder's title and icon. Selecting a tab in the focused
// window, or focusing a window, swaps the page's browser into that window
// (gBrowser.swapBrowsers), so the page keeps its state and history. The
// window it left shows a screenshot of it until the page comes back.
//
// Instances are matched by an id stored on the tab through SessionStore
// (SYNC_ID_KEY), folders by their group id and splits by their split view id.
// Kit's own tab values (workspace, Essential) are copied with the tab.
//
// SessionStore saves every window, mirrors included, but only the holder has
// the page's history. On startup the windows are merged again: for each tab
// the instance with a page wins and the others become mirrors. Tabs only one
// window has (from before sync, or reopened windows) are added to the rest.
//
// Private windows and minimal windows (no toolbar: pop-ups, links from other
// apps) aren't synced.

const { SessionStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs",
) as { SessionStore: SessionStoreApi };

const { RunState } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/RunState.sys.mjs",
) as { RunState: { isQuitting: boolean } };

const { BrowserWindowTracker } = ChromeUtils.importESModule(
  "resource:///modules/BrowserWindowTracker.sys.mjs",
) as { BrowserWindowTracker: { orderedWindows: SyncWindow[] } };

const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
) as { PrivateBrowsingUtils: { isWindowPrivate(window: Window): boolean } };

const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs",
) as { setTimeout: typeof globalThis.setTimeout };

export const WINDOW_SYNC_PREF = "neoworks.windows.sync";
const SYNC_ID_KEY = "neoworksSyncId";
// Kit's tab values travel with the tab; the sync id is set separately.
const KIT_VALUE_PREFIX = "neoworks";
// Set on a window as it closes, to find its entry in closed windows.
const CLOSING_MARK_KEY = "neoworksClosingMark";
// Dispatched on a tab after its values or structure were copied from another
// window, so per-window features (workspace visibility) re-read it.
export const TAB_SYNCED_EVENT = "NWTabSynced";
// Kit's chrome code dispatches this on a tab after changing one of its values.
export const TAB_VALUES_CHANGED_EVENT = "NWTabValuesChanged";
const PLACEHOLDER_CLASS = "nw-sync-placeholder";
const PLACEHOLDER_LEAVING_ATTRIBUTE = "data-leaving";
// Matches the transition in neoworks-window-sync/window-sync.css.
const PLACEHOLDER_FADE_MS = 160;
const XHTML_NS = "http://www.w3.org/1999/xhtml";
// How long a swap waits for SessionStore to finish restoring the tab that
// takes the page; restoring a mirror only loads about:blank.
const RESTORE_TIMEOUT_MS = 3000;

const STRUCTURE_EVENTS = [
  "TabMove",
  "TabPinned",
  "TabUnpinned",
  "TabGrouped",
  "TabUngrouped",
  "TabGroupMoved",
  "TabGroupUpdate",
  "TabGroupCollapse",
  "TabGroupExpand",
  "TabGroupRemoved",
  "SplitViewCreated",
  "SplitViewRemoved",
  "SplitViewTabChange",
];

const TAB_EVENTS = [
  "TabOpen",
  "TabClose",
  "TabSelect",
  "TabAttrModified",
  TAB_VALUES_CHANGED_EVENT,
  ...STRUCTURE_EVENTS,
];

interface SessionHistoryEntry {
  url?: string;
  title?: string;
  triggeringPrincipal_base64?: string;
}

interface TabStateData {
  entries: SessionHistoryEntry[];
  index?: number;
  hidden?: boolean;
  pinned?: boolean;
  groupId?: string | null;
  splitViewId?: number | null;
  extData?: Record<string, string>;
  [key: string]: unknown;
}

interface ClosedWindowData {
  closedId: number;
  closedAt: number;
  extData?: Record<string, string>;
}

interface SessionStoreApi {
  promiseAllWindowsRestored: Promise<void>;
  getCustomTabValue(tab: SyncTab, key: string): string;
  setCustomTabValue(tab: SyncTab, key: string, value: string): void;
  deleteCustomTabValue(tab: SyncTab, key: string): void;
  getInternalObjectState(tab: SyncTab): Record<string, string> | undefined;
  getTabState(tab: SyncTab): string;
  setTabState(tab: SyncTab, state: string): void;
  isTabRestoring(tab: SyncTab): boolean;
  getClosedWindowData(): ClosedWindowData[];
  setCustomWindowValue(window: Window, key: string, value: string): void;
  forgetClosedWindowById(closedId: number): void;
}

interface SyncBrowser extends Element {
  currentURI: { spec: string };
  canGoBack: boolean;
  isRemoteBrowser: boolean;
  docShellIsActive: boolean;
  permanentKey: object;
  drawSnapshot(
    x: number,
    y: number,
    w: number,
    h: number,
    scale: number,
    backgroundColor: string,
    fullViewport?: boolean,
  ): Promise<ImageBitmap>;
  loadURI(uri: nsIURI, options: object): void;
  focus(): void;
}

interface SyncGroup extends Element {
  id: string;
  label: string;
  color: string;
  collapsed: boolean;
  tabs: SyncTab[];
}

interface SyncSplit extends Element {
  splitViewId: number;
  tabs: SyncTab[];
  unsplitTabs(): void;
}

interface SyncTab extends Element {
  linkedBrowser: SyncBrowser | null;
  linkedPanel: string;
  permanentKey: object;
  label: string;
  pinned: boolean;
  selected: boolean;
  closing: boolean;
  userContextId: number;
  lastAccessed: number;
  index: number;
  group: SyncGroup | null;
  splitview: SyncSplit | null;
}

type TabListItem = SyncTab | SyncGroup | SyncSplit;

interface SyncTabbrowser {
  tabs: SyncTab[];
  tabGroups: SyncGroup[];
  splitViews: SyncSplit[];
  selectedTab: SyncTab;
  pinnedTabCount: number;
  tabContainer: Element;
  addTrustedTab(uri: string, options: object): SyncTab;
  removeTab(tab: SyncTab, options?: object): void;
  pinTab(tab: SyncTab): void;
  unpinTab(tab: SyncTab): void;
  moveTabAfter(element: TabListItem, target: TabListItem): void;
  moveTabBefore(element: TabListItem, target: TabListItem): void;
  moveTabToExistingGroup(tab: SyncTab, group: SyncGroup): void;
  moveTabToSplitView(tab: SyncTab, split: SyncSplit, index?: number): void;
  addTabGroup(
    tabs: SyncTab[],
    options: { id: string; label: string; color: string; insertBefore?: TabListItem | null },
  ): SyncGroup | null;
  addTabSplitView(
    tabs: SyncTab[],
    options: { id: number; insertBefore?: TabListItem | null },
  ): SyncSplit | null;
  ungroupTab(tab: SyncTab): void;
  swapBrowsers(ourTab: SyncTab, otherTab: SyncTab): void;
  setInitialTabTitle(tab: SyncTab, title: string, options: object): void;
  isTab(element: unknown): boolean;
  isTabGroup(element: unknown): boolean;
  isSplitViewWrapper(element: unknown): boolean;
  _tabAttrModified(tab: SyncTab, changed: string[]): void;
  _adjustFocusAfterTabSwitch(tab: SyncTab): void;
  updateCurrentBrowser(force: boolean): void;
}

interface SyncWindow extends Window {
  gBrowser: SyncTabbrowser;
  delayedStartupPromise?: Promise<void>;
}

type TabSelectEvent = CustomEvent<{ previousTab?: SyncTab }>;
type TabCloseEvent = CustomEvent<{ adoptedBy?: SyncTab }>;
type TabOpenEvent = CustomEvent<{ adoptedTab?: SyncTab }>;
type TabAttrModifiedEvent = CustomEvent<{ changed?: string[] }>;

// Windows whose tabs are synced.
const windows = new Set<SyncWindow>();
// Windows that asked to be synced but wait for session restore.
const pending = new Set<SyncWindow>();
// The instance of each tab whose browser has the page.
const holders = new Map<string, SyncTab>();
// While above zero, this module is changing tabs itself; the events that
// causes aren't synced back.
let applying = 0;
let started = false;
let prefObserverAdded = false;

// Tabs opened, closed and restructured during one task are synced together
// right after it (see flush()).
const openedTabs = new Set<SyncTab>();
const adoptedTabs = new Set<SyncTab>();
const closedIds = new Map<string, SyncWindow>();
const restructured = new Set<SyncWindow>();
const valueChanges = new Set<SyncTab>();
let flushQueued = false;

// Page swaps run one after another.
let swapQueue: Promise<void> = Promise.resolve();

function enabled(): boolean {
  return Services.prefs.getBoolPref(WINDOW_SYNC_PREF, true);
}

function windowOf(tab: SyncTab): SyncWindow {
  // ownerGlobal isn't available to system modules.
  return tab.ownerDocument.defaultView as unknown as SyncWindow;
}

function isSyncable(window: SyncWindow): boolean {
  return !window.closed && window.toolbar.visible &&
    !PrivateBrowsingUtils.isWindowPrivate(window) && Boolean(window.gBrowser);
}

function withApplying<T>(callback: () => T): T {
  applying++;
  try {
    return callback();
  } finally {
    applying--;
  }
}

function syncId(tab: SyncTab): string {
  return SessionStore.getCustomTabValue(tab, SYNC_ID_KEY);
}

function newSyncId(): string {
  return crypto.randomUUID();
}

function liveTabs(window: SyncWindow): SyncTab[] {
  return window.gBrowser.tabs.filter((tab) => !tab.closing);
}

function instanceIn(window: SyncWindow, id: string): SyncTab | null {
  if (!id) {
    return null;
  }
  return liveTabs(window).find((tab) => syncId(tab) === id) ?? null;
}

function otherWindows(except: SyncWindow | null): SyncWindow[] {
  return [...windows].filter((window) => window !== except && !window.closed);
}

// Most recently focused first.
function windowsByRecency(except: SyncWindow | null): SyncWindow[] {
  const ordered = BrowserWindowTracker.orderedWindows.filter((window) =>
    windows.has(window) && window !== except && !window.closed
  );
  const rest = otherWindows(except).filter((window) => !ordered.includes(window));
  return [...ordered, ...rest];
}

function holderOf(tab: SyncTab): SyncTab | null {
  const holder = holders.get(syncId(tab));
  if (!holder || holder.closing || !windows.has(windowOf(holder))) {
    return null;
  }
  return holder;
}

// Whether the tab's page is in another window. Unsynced tabs aren't mirrors.
export function isMirror(tab: SyncTab): boolean {
  const holder = holderOf(tab);
  return Boolean(holder) && holder !== tab;
}

// The instance that has the tab's page: the tab itself unless it's a mirror.
export function contentTab<T extends Element>(tab: T): T {
  const syncTab = tab as unknown as SyncTab;
  if (!windows.has(windowOf(syncTab))) {
    return tab;
  }
  return (holderOf(syncTab) ?? syncTab) as unknown as T;
}

// When any instance of the tab was last selected.
export function lastAccessedAnywhere(tab: Element): number {
  const syncTab = tab as unknown as SyncTab;
  const id = syncId(syncTab);
  if (!id || !windows.has(windowOf(syncTab))) {
    return syncTab.lastAccessed;
  }
  let latest = syncTab.lastAccessed;
  for (const window of windows) {
    const instance = instanceIn(window, id);
    if (instance) {
      latest = Math.max(latest, instance.lastAccessed);
    }
  }
  return latest;
}

// Kit's tab values (workspace, Essential), without the sync id.
function kitValues(tab: SyncTab): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(SessionStore.getInternalObjectState(tab) ?? {})) {
    if (key.startsWith(KIT_VALUE_PREFIX) && key !== SYNC_ID_KEY) {
      values[key] = value;
    }
  }
  return values;
}

function copyValues(source: SyncTab, target: SyncTab): void {
  const values = kitValues(source);
  for (const key of Object.keys(kitValues(target))) {
    if (!(key in values)) {
      SessionStore.deleteCustomTabValue(target, key);
    }
  }
  for (const [key, value] of Object.entries(values)) {
    if (SessionStore.getCustomTabValue(target, key) !== value) {
      SessionStore.setCustomTabValue(target, key, value);
    }
  }
}

function announceSynced(tab: SyncTab): void {
  tab.dispatchEvent(new (windowOf(tab).CustomEvent)(TAB_SYNCED_EVENT, { bubbles: true }));
}

function copyLabel(source: SyncTab, target: SyncTab): void {
  if (source.label && target.label !== source.label) {
    windowOf(target).gBrowser.setInitialTabTitle(target, source.label, { isContentTitle: true });
  }
}

// gBrowser.setIcon refuses remote icon URLs, which tabs' icons usually are.
function copyIcon(source: SyncTab, target: SyncTab): void {
  const image = source.getAttribute("image") ?? "";
  if ((target.getAttribute("image") ?? "") === image) {
    return;
  }
  const principal = source.getAttribute("iconloadingprincipal");
  if (principal) {
    target.setAttribute("iconloadingprincipal", principal);
  }
  if (image) {
    target.setAttribute("image", image);
  } else {
    target.removeAttribute("image");
  }
  windowOf(target).gBrowser._tabAttrModified(target, ["image"]);
}

// --- Mirrors -------------------------------------------------------------

// An unloaded about:blank tab: selecting it loads nothing but a blank page,
// which the swap then replaces with the holder's.
function createMirror(window: SyncWindow, source: SyncTab): SyncTab {
  const tab = window.gBrowser.addTrustedTab("about:blank", {
    createLazyBrowser: true,
    inBackground: true,
    skipAnimation: true,
    userContextId: source.userContextId,
    lazyTabTitle: source.label,
    pinned: source.pinned,
  });
  SessionStore.setCustomTabValue(tab, SYNC_ID_KEY, syncId(source));
  copyValues(source, tab);
  copyLabel(source, tab);
  copyIcon(source, tab);
  if (!source.hasAttribute("pending")) {
    tab.removeAttribute("pending");
  }
  announceSynced(tab);
  return tab;
}

function isBlankUrl(url: string | undefined): boolean {
  return !url || url === "about:blank";
}

function parseState(tab: SyncTab): TabStateData | null {
  try {
    return JSON.parse(SessionStore.getTabState(tab)) as TabStateData;
  } catch {
    return null;
  }
}

function isLive(tab: SyncTab): boolean {
  return Boolean(tab.linkedPanel) && Boolean(tab.linkedBrowser) &&
    !tab.hasAttribute("pending");
}

// 2: a loaded page, 1: an unloaded tab with history, 0: nothing (a mirror).
function contentScore(tab: SyncTab): number {
  if (isLive(tab)) {
    const browser = tab.linkedBrowser as SyncBrowser;
    if (!isBlankUrl(browser.currentURI.spec) || browser.canGoBack) {
      return 2;
    }
  }
  const state = parseState(tab);
  return state?.entries.some((entry) => !isBlankUrl(entry.url)) ? 1 : 0;
}

// State for setTabState on `tab` that leaves what is per window (visibility)
// and kept in sync separately (structure) as it is: setTabState applies
// pinned and hidden, and treats missing ones as false.
function portableState(state: TabStateData, tab: SyncTab): TabStateData {
  const copy: TabStateData = {
    ...state,
    pinned: tab.pinned,
    hidden: tab.hasAttribute("hidden"),
  };
  delete copy.groupId;
  delete copy.splitViewId;
  return copy;
}

function blankState(tab: SyncTab, state: TabStateData): TabStateData {
  return {
    ...portableState(state, tab),
    entries: [{
      url: "about:blank",
      title: tab.label,
      triggeringPrincipal_base64: state.entries[0]?.triggeringPrincipal_base64,
    }],
    index: 1,
  };
}

function loadBlank(browser: SyncBrowser): void {
  browser.loadURI(Services.io.newURI("about:blank"), {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    loadFlags: Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY,
  });
}

// Drops a former holder's page so that only the holder's is saved.
function demote(tab: SyncTab): void {
  const state = parseState(tab);
  if (!state) {
    return;
  }
  withApplying(() => {
    if (isLive(tab)) {
      const browser = tab.linkedBrowser as SyncBrowser;
      if (!isBlankUrl(browser.currentURI.spec) || browser.canGoBack) {
        loadBlank(browser);
      }
      return;
    }
    if (state.entries.some((entry) => !isBlankUrl(entry.url))) {
      SessionStore.setTabState(tab, JSON.stringify(blankState(tab, state)));
    }
  });
}

// Gives `to` the page of `from` by restoring its state; for pages that
// can't be swapped (unloaded, or a different kind of process).
function moveState(from: SyncTab, to: SyncTab): void {
  const state = parseState(from);
  if (!state) {
    return;
  }
  withApplying(() => {
    SessionStore.setTabState(to, JSON.stringify(portableState(state, to)));
  });
  demote(from);
}

// --- Placeholders --------------------------------------------------------

function placeholdersOf(tab: SyncTab): Element[] {
  const stack = tab.linkedBrowser?.parentElement;
  return [...(stack?.querySelectorAll(`.${PLACEHOLDER_CLASS}`) ?? [])];
}

function discardPlaceholder(element: Element): void {
  const source = element.querySelector("img")?.getAttribute("src") ?? "";
  if (source.startsWith("blob:")) {
    URL.revokeObjectURL(source);
  }
  element.remove();
}

function removePlaceholder(tab: SyncTab): void {
  placeholdersOf(tab).forEach(discardPlaceholder);
}

// A page swapped into a window paints a moment later; removing its picture
// right away showed the blank browser in between. It fades out once the
// page has had two frames to paint.
function fadeOutPlaceholder(tab: SyncTab): void {
  const elements = placeholdersOf(tab);
  if (elements.length === 0) {
    return;
  }
  const window = windowOf(tab);
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => {
      for (const element of elements) {
        element.setAttribute(PLACEHOLDER_LEAVING_ATTRIBUTE, "true");
        window.setTimeout(() => discardPlaceholder(element), PLACEHOLDER_FADE_MS);
      }
    })
  );
}

function isShown(tab: SyncTab): boolean {
  const selected = windowOf(tab).gBrowser.selectedTab;
  return tab.selected || (Boolean(tab.splitview) && selected.splitview === tab.splitview);
}

async function screenshot(tab: SyncTab): Promise<string> {
  const window = windowOf(tab);
  const bitmap = await (tab.linkedBrowser as SyncBrowser).drawSnapshot(
    0,
    0,
    0,
    0,
    window.devicePixelRatio || 1,
    "transparent",
    true,
  );
  const canvas = new window.OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return window.URL.createObjectURL(blob);
}

// The page about to leave a window stays there as a picture.
async function leavePlaceholder(tab: SyncTab): Promise<void> {
  const browser = tab.linkedBrowser;
  if (!browser || !isShown(tab)) {
    return;
  }
  let source = "";
  try {
    source = await screenshot(tab);
  } catch (error) {
    console.error("[NWWindowSync] Couldn't capture the page for its placeholder:", error);
    return;
  }
  removePlaceholder(tab);
  const document = tab.ownerDocument;
  const placeholder = document.createElementNS(XHTML_NS, "div");
  placeholder.className = PLACEHOLDER_CLASS;
  const image = document.createElementNS(XHTML_NS, "img");
  image.setAttribute("src", source);
  const label = document.createElementNS(XHTML_NS, "span");
  label.className = `${PLACEHOLDER_CLASS}-label`;
  label.textContent = "Open in another window";
  placeholder.append(image, label);
  browser.after(placeholder);
}

// --- Moving pages ---------------------------------------------------------

function restored(tab: SyncTab): Promise<void> {
  if (!SessionStore.isTabRestoring(tab)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      tab.removeEventListener("SSTabRestored", done);
      resolve();
    };
    tab.addEventListener("SSTabRestored", done);
    setTimeout(done, RESTORE_TIMEOUT_MS);
  });
}

// SessionStore keeps a tab's history under its browser's permanentKey and
// re-points that history at whatever page the browser shows when a page
// moves in (browsing-context-did-set-embedder). swapBrowsers fires that while
// the pages move, and only then swaps the two browsers' keys, so each key
// ended up with the other window's history: the window showing the page
// saved a blank tab and the one left blank saved the page. Swapping the keys
// back keeps each with the history recorded under it.
function keepPermanentKeys(ours: SyncTab, holder: SyncTab): void {
  const ourBrowser = ours.linkedBrowser;
  const holderBrowser = holder.linkedBrowser;
  if (!ourBrowser || !holderBrowser) {
    return;
  }
  const key = ourBrowser.permanentKey;
  ourBrowser.permanentKey = holderBrowser.permanentKey;
  holderBrowser.permanentKey = key;
  ours.permanentKey = ourBrowser.permanentKey;
  holder.permanentKey = holderBrowser.permanentKey;
}

function canSwap(ours: SyncTab, other: SyncTab): boolean {
  return isLive(other) && windowOf(ours) !== windowOf(other) &&
    Boolean(ours.linkedBrowser) &&
    ours.linkedBrowser?.isRemoteBrowser === other.linkedBrowser?.isRemoteBrowser;
}

// A mirror SessionStore still means to restore (restored at startup, or
// demoted) would load its blank state over a page swapped into it. It is
// replaced by a new mirror that SessionStore leaves alone.
function freshInstance(old: SyncTab): SyncTab {
  const window = windowOf(old);
  const gBrowser = window.gBrowser;
  return withApplying(() => {
    const tab = createMirror(window, old);
    if (old.splitview) {
      gBrowser.moveTabToSplitView(tab, old.splitview, old.splitview.tabs.indexOf(old));
    } else {
      if (old.group) {
        gBrowser.moveTabToExistingGroup(tab, old.group);
      }
      gBrowser.moveTabAfter(tab, old);
    }
    if (old.selected) {
      gBrowser.selectedTab = tab;
    }
    if (holders.get(syncId(old)) === old) {
      holders.set(syncId(old), tab);
    }
    gBrowser.removeTab(old, { animate: false, skipSessionStore: true });
    return tab;
  });
}

// Moves the page of `holder` into `tab`, in another window. Returns the tab
// that has the page now: `tab`, or the mirror that replaced it.
function takePage(tab: SyncTab, holder: SyncTab): SyncTab {
  if (!isLive(holder)) {
    moveState(holder, tab);
    return tab;
  }
  const ours = SessionStore.isTabRestoring(tab) ? freshInstance(tab) : tab;
  const window = windowOf(ours);
  if (!canSwap(ours, holder)) {
    moveState(holder, ours);
    return ours;
  }
  const ourBrowser = ours.linkedBrowser as SyncBrowser;
  // A mirror that had to restore may have loaded more than about:blank.
  const ourPageIsBlank = isBlankUrl(ourBrowser.currentURI.spec) && !ourBrowser.canGoBack;
  withApplying(() => {
    try {
      window.gBrowser.swapBrowsers(ours, holder);
    } catch (error) {
      console.error("[NWWindowSync] Swapping the page between windows failed:", error);
      moveState(holder, ours);
      return;
    }
    keepPermanentKeys(ours, holder);
    ours.removeAttribute("pending");
    for (const attribute of ["busy", "soundplaying", "muted", "sharing", "pictureinpicture"]) {
      if (holder.hasAttribute(attribute)) {
        ours.setAttribute(attribute, holder.getAttribute(attribute) ?? "");
        holder.removeAttribute(attribute);
      }
    }
    const holderBrowser = holder.linkedBrowser;
    if (holderBrowser && !ourPageIsBlank) {
      loadBlank(holderBrowser);
    }
  });
  // Like Firefox after tearing off a tab: the address bar, back and forward
  // buttons and the rest of the toolbar follow the page that came in.
  if (ours.selected) {
    ourBrowser.docShellIsActive = true;
    window.gBrowser.updateCurrentBrowser(true);
    window.gBrowser._adjustFocusAfterTabSwitch(ours);
  }
  return ours;
}

async function bringPage(tab: SyncTab): Promise<void> {
  if (tab.closing || !windows.has(windowOf(tab))) {
    return;
  }
  const id = syncId(tab);
  const holder = holderOf(tab);
  if (!id) {
    return;
  }
  if (!holder) {
    holders.set(id, tab);
    return;
  }
  if (holder === tab) {
    removePlaceholder(tab);
    return;
  }
  await restored(tab);
  if (tab.closing || holder.closing || holderOf(tab) !== holder) {
    return;
  }
  if (isLive(holder)) {
    await leavePlaceholder(holder);
  }
  await runInWindowTask(windowOf(tab), () => {
    if (tab.closing || holder.closing || holderOf(tab) !== holder) {
      return;
    }
    const taker = takePage(tab, holder);
    holders.set(id, taker);
    fadeOutPlaceholder(taker);
  });
}

// The selected tab and the other panes of its split view.
function shownTabs(window: SyncWindow): SyncTab[] {
  const selected = window.gBrowser.selectedTab;
  return selected.splitview ? [...selected.splitview.tabs] : [selected];
}

function bringShownPages(window: SyncWindow): void {
  if (!windows.has(window) || Services.focus.activeWindow !== window) {
    return;
  }
  for (const tab of shownTabs(window)) {
    swapQueue = swapQueue.then(() => bringPage(tab)).catch((error) =>
      console.error("[NWWindowSync] Moving a page to the focused window failed:", error)
    );
  }
}

// --- Structure ------------------------------------------------------------

function itemKey(item: TabListItem, window: SyncWindow): string {
  const gBrowser = window.gBrowser;
  if (gBrowser.isTabGroup(item)) {
    return `g:${(item as SyncGroup).id}`;
  }
  if (gBrowser.isSplitViewWrapper(item)) {
    return `s:${(item as SyncSplit).splitViewId}`;
  }
  return `t:${syncId(item as SyncTab)}`;
}

function isListItem(element: Element, window: SyncWindow): element is TabListItem {
  const gBrowser = window.gBrowser;
  if (gBrowser.isTab(element)) {
    return !(element as SyncTab).closing && !(element as SyncTab).pinned;
  }
  return gBrowser.isTabGroup(element) || gBrowser.isSplitViewWrapper(element);
}

function childItems(parent: Element, window: SyncWindow): TabListItem[] {
  return [...parent.children].filter((element) => isListItem(element, window));
}

// The unpinned list's top level: loose tabs, folders and splits.
function topItems(window: SyncWindow): TabListItem[] {
  const gBrowser = window.gBrowser;
  const items: TabListItem[] = [];
  const seen = new Set<Element>();
  for (const tab of liveTabs(window)) {
    if (tab.pinned) {
      continue;
    }
    const item: TabListItem = tab.group ?? tab.splitview ?? tab;
    if (!seen.has(item)) {
      seen.add(item);
      items.push(item);
    }
  }
  return items.filter((item) => gBrowser.isTab(item) || item.isConnected);
}

function findGroup(window: SyncWindow, id: string): SyncGroup | null {
  return window.gBrowser.tabGroups.find((group) => group.id === id) ?? null;
}

function findSplit(window: SyncWindow, id: number): SyncSplit | null {
  return window.gBrowser.splitViews.find((split) => split.splitViewId === id) ?? null;
}

// Puts the target's items (those `currentItems` lists) into the order of
// `sourceItems`; items the target lacks are skipped.
function orderItems(
  sourceItems: TabListItem[],
  target: SyncWindow,
  resolve: (key: string) => TabListItem | null,
  currentItems: () => TabListItem[],
): void {
  const gBrowser = target.gBrowser;
  const source = windowOfItems(sourceItems);
  let previous: TabListItem | null = null;
  for (const sourceItem of sourceItems) {
    const item = source ? resolve(itemKey(sourceItem, source)) : null;
    if (!item) {
      continue;
    }
    const current = currentItems();
    if (previous === null) {
      if (current[0] !== item && current[0]) {
        gBrowser.moveTabBefore(item, current[0]);
      }
    } else if (current[current.indexOf(previous) + 1] !== item) {
      gBrowser.moveTabAfter(item, previous);
    }
    previous = item;
  }
}

function windowOfItems(items: TabListItem[]): SyncWindow | null {
  const first = items[0];
  return first ? first.ownerDocument.defaultView as unknown as SyncWindow : null;
}

function syncGroupLook(source: SyncGroup, target: SyncGroup): void {
  if (target.label !== source.label) {
    target.label = source.label;
  }
  if (target.color !== source.color) {
    target.color = source.color;
  }
  if (target.collapsed !== source.collapsed) {
    target.collapsed = source.collapsed;
  }
}

// Folder and split membership of one tab.
function syncMembership(source: SyncTab, target: SyncTab, window: SyncWindow): void {
  const gBrowser = window.gBrowser;
  const sourceSplit = source.splitview;
  const sourceGroup = source.group;

  if (target.splitview && target.splitview.splitViewId !== sourceSplit?.splitViewId) {
    const split = target.splitview;
    if (split.tabs.length <= 2) {
      split.unsplitTabs();
    } else {
      gBrowser.moveTabAfter(target, split);
    }
  }
  if (sourceGroup) {
    const group = findGroup(window, sourceGroup.id);
    if (!group) {
      const created = gBrowser.addTabGroup([target], {
        id: sourceGroup.id,
        label: sourceGroup.label,
        color: sourceGroup.color,
        insertBefore: target,
      });
      if (created) {
        syncGroupLook(sourceGroup, created);
      }
    } else if (target.group !== group) {
      gBrowser.moveTabToExistingGroup(target, group);
    }
  } else if (target.group) {
    gBrowser.ungroupTab(target);
  }
  if (sourceSplit && !target.splitview) {
    const split = findSplit(window, sourceSplit.splitViewId);
    if (split) {
      gBrowser.moveTabToSplitView(target, split);
    } else {
      const partners = sourceSplit.tabs
        .map((tab) => instanceIn(window, syncId(tab)))
        .filter((tab): tab is SyncTab => tab !== null && !tab.splitview && !tab.pinned);
      if (partners.length >= 2) {
        gBrowser.addTabSplitView(partners, {
          id: sourceSplit.splitViewId,
          insertBefore: partners[0],
        });
      }
    }
  }
}

// Makes `target` show the source window's pinned tabs, folders, splits and
// order. Both windows have the same tabs by now.
function syncStructure(source: SyncWindow, target: SyncWindow): void {
  const gBrowser = target.gBrowser;
  const sourceTabs = liveTabs(source);
  const pairs: [SyncTab, SyncTab][] = [];
  for (const sourceTab of sourceTabs) {
    const targetTab = instanceIn(target, syncId(sourceTab));
    if (targetTab) {
      pairs.push([sourceTab, targetTab]);
    }
  }

  for (const [sourceTab, targetTab] of pairs) {
    if (sourceTab.pinned && !targetTab.pinned) {
      gBrowser.pinTab(targetTab);
    } else if (!sourceTab.pinned && targetTab.pinned) {
      gBrowser.unpinTab(targetTab);
    }
  }
  for (const [sourceTab, targetTab] of pairs) {
    if (!sourceTab.pinned) {
      syncMembership(sourceTab, targetTab, target);
    }
  }
  for (const sourceGroup of source.gBrowser.tabGroups) {
    const group = findGroup(target, sourceGroup.id);
    if (group) {
      syncGroupLook(sourceGroup, group);
    }
  }

  const byId = new Map(pairs.map(([sourceTab, targetTab]) => [syncId(sourceTab), targetTab]));
  const resolve = (key: string): TabListItem | null => {
    const [kind, id] = [key.slice(0, 1), key.slice(2)];
    if (kind === "g") {
      return findGroup(target, id);
    }
    if (kind === "s") {
      return findSplit(target, Number(id));
    }
    return byId.get(id) ?? null;
  };

  // Pinned tabs, in order.
  const sourcePinned = sourceTabs.filter((tab) => tab.pinned);
  orderItems(
    sourcePinned,
    target,
    resolve,
    () => liveTabs(target).filter((tab) => tab.pinned),
  );
  // Top level, then inside each folder and split.
  orderItems(topItems(source), target, resolve, () => topItems(target));
  for (const sourceGroup of source.gBrowser.tabGroups) {
    const group = findGroup(target, sourceGroup.id);
    if (group) {
      orderItems(
        childItems(sourceGroup, source),
        target,
        resolve,
        () => childItems(group, target),
      );
    }
  }
  for (const sourceSplit of source.gBrowser.splitViews) {
    const split = findSplit(target, sourceSplit.splitViewId);
    if (!split) {
      continue;
    }
    sourceSplit.tabs.forEach((sourceTab, index) => {
      const tab = byId.get(syncId(sourceTab));
      if (tab && split.tabs[index] !== tab && tab.splitview === split) {
        gBrowser.moveTabToSplitView(tab, split, index);
      }
    });
  }
}

// --- Event handling ---------------------------------------------------------

// Runs `callback` as a task of a browser window, the way Firefox's own tab
// code always runs. From a module's timer or promise, Gecko runs microtasks
// (mutation observers) in the middle of a DOM call instead: a folder created
// there sees itself empty before its first tab is in, and removes itself
// with the tab.
function inWindowTask(callback: () => void): void {
  const window = [...windows].find((candidate) => !candidate.closed) ??
    [...pending].find((candidate) => !candidate.closed);
  if (window) {
    window.setTimeout(callback, 0);
  } else {
    setTimeout(callback, 0);
  }
}

function runInWindowTask(window: SyncWindow, callback: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      try {
        callback();
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 0);
  });
}

function queueFlush(): void {
  if (flushQueued) {
    return;
  }
  flushQueued = true;
  // After the current task, so a tab SessionStore restores has its values,
  // and a burst of events (a folder created, tabs moved) is synced once.
  inWindowTask(flush);
}

// Opens first: Kit replaces a workspace's last closed tab with a new one, and
// the other windows should get that tab before theirs closes.
function flush(): void {
  flushQueued = false;
  try {
    withApplying(() => {
      flushAdopted();
      flushOpened();
      flushValues();
      flushClosed();
      flushStructure();
    });
  } catch (error) {
    console.error("[NWWindowSync] Syncing tabs between windows failed:", error);
  }
}

function claimId(tab: SyncTab): string {
  let id = syncId(tab);
  const window = windowOf(tab);
  // Duplicated tabs and reopened ones can bring an id that's already used.
  const taken = Boolean(id) &&
    liveTabs(window).some((other) => other !== tab && syncId(other) === id);
  if (!id || taken) {
    id = newSyncId();
    SessionStore.setCustomTabValue(tab, SYNC_ID_KEY, id);
  }
  return id;
}

function flushOpened(): void {
  const tabs = [...openedTabs];
  openedTabs.clear();
  for (const tab of tabs) {
    const window = windowOf(tab);
    if (tab.closing || !windows.has(window)) {
      continue;
    }
    const id = claimId(tab);
    holders.set(id, tab);
    for (const other of otherWindows(window)) {
      if (!instanceIn(other, id)) {
        createMirror(other, tab);
      }
    }
    restructured.add(window);
  }
}

// A tab moved here from another window brings its id: it replaces this
// window's instance, and the window it left gets a mirror instead.
function flushAdopted(): void {
  const tabs = [...adoptedTabs];
  adoptedTabs.clear();
  for (const tab of tabs) {
    const window = windowOf(tab);
    if (tab.closing || !windows.has(window)) {
      continue;
    }
    const id = syncId(tab);
    if (!id) {
      openedTabs.add(tab);
      continue;
    }
    for (const other of liveTabs(window)) {
      if (other !== tab && syncId(other) === id) {
        window.gBrowser.removeTab(other, { animate: false, skipSessionStore: true });
      }
    }
    holders.set(id, tab);
    for (const other of otherWindows(window)) {
      if (!instanceIn(other, id)) {
        createMirror(other, tab);
      }
    }
    restructured.add(window);
  }
}

function flushValues(): void {
  const tabs = [...valueChanges];
  valueChanges.clear();
  for (const tab of tabs) {
    const window = windowOf(tab);
    if (tab.closing || !windows.has(window)) {
      continue;
    }
    for (const other of otherWindows(window)) {
      const instance = instanceIn(other, syncId(tab));
      if (instance) {
        copyValues(tab, instance);
        announceSynced(instance);
      }
    }
  }
}

// The holder closes like any tab, so its page lands in Recently closed; the
// mirrors close without a trace.
function flushClosed(): void {
  const closed = [...closedIds];
  closedIds.clear();
  for (const [id, from] of closed) {
    const holder = holders.get(id);
    for (const window of otherWindows(from)) {
      const instance = instanceIn(window, id);
      if (!instance) {
        continue;
      }
      window.gBrowser.removeTab(instance, {
        animate: false,
        skipSessionStore: instance !== holder,
      });
    }
    holders.delete(id);
  }
}

function flushStructure(): void {
  const sources = [...restructured];
  restructured.clear();
  for (const source of sources) {
    if (!windows.has(source)) {
      continue;
    }
    for (const target of otherWindows(source)) {
      syncStructure(source, target);
    }
  }
}

function onTabOpen(event: TabOpenEvent): void {
  const tab = event.target as SyncTab;
  if (event.detail?.adoptedTab) {
    adoptedTabs.add(tab);
  } else {
    openedTabs.add(tab);
  }
  queueFlush();
}

function onTabClose(event: TabCloseEvent): void {
  const tab = event.target as SyncTab;
  openedTabs.delete(tab);
  removePlaceholder(tab);
  const id = syncId(tab);
  if (!id) {
    return;
  }
  const window = windowOf(tab);
  const adoptedBy = event.detail?.adoptedBy;
  if (adoptedBy) {
    // Moved to another window; a synced one keeps it there (flushAdopted).
    // This window keeps an instance either way.
    if (holders.get(id) === tab) {
      holders.delete(id);
    }
    inWindowTask(() => {
      if (!windows.has(window) || instanceIn(window, id)) {
        return;
      }
      const source = [...windows].map((other) => instanceIn(other, id)).find(Boolean);
      if (source) {
        withApplying(() => createMirror(window, source));
        restructured.add(windowOf(source));
        queueFlush();
      }
    });
    return;
  }
  closedIds.set(id, window);
  queueFlush();
}

function onTabSelect(event: TabSelectEvent): void {
  const window = windowOf(event.target as SyncTab);
  const previous = event.detail?.previousTab;
  if (previous && isMirror(previous) && !isShown(previous)) {
    removePlaceholder(previous);
  }
  bringShownPages(window);
}

// Mirrors keep the holder's title and icon, whatever their blank page says;
// the holder's changes go to every mirror.
function onTabAttrModified(event: TabAttrModifiedEvent): void {
  const tab = event.target as SyncTab;
  const changed = event.detail?.changed ?? [];
  const label = changed.includes("label");
  const image = changed.includes("image");
  if (!label && !image) {
    return;
  }
  const holder = holderOf(tab);
  if (!holder) {
    return;
  }
  withApplying(() => {
    const targets = holder === tab
      ? otherWindows(windowOf(tab)).map((window) => instanceIn(window, syncId(tab)))
      : [tab];
    for (const target of targets) {
      if (!target) {
        continue;
      }
      if (label) {
        copyLabel(holder, target);
      }
      if (image) {
        copyIcon(holder, target);
      }
    }
  });
}

function handleEvent(event: Event): void {
  if (!enabled()) {
    return;
  }
  const window = (event.currentTarget as SyncWindow);
  if (!windows.has(window)) {
    return;
  }
  if (event.type === "activate") {
    bringShownPages(window);
    return;
  }
  if (event.type === "SSWindowClosing") {
    onWindowClosing(window);
    return;
  }
  if (event.type === "TabAttrModified") {
    // Also for mirrors this module updates, to correct their own title.
    onTabAttrModified(event as TabAttrModifiedEvent);
    return;
  }
  if (applying > 0) {
    return;
  }
  switch (event.type) {
    case "TabOpen":
      onTabOpen(event as TabOpenEvent);
      return;
    case "TabClose":
      onTabClose(event as TabCloseEvent);
      return;
    case "TabSelect":
      onTabSelect(event as TabSelectEvent);
      return;
    case TAB_VALUES_CHANGED_EVENT:
      valueChanges.add(event.target as SyncTab);
      queueFlush();
      return;
  }
  if (STRUCTURE_EVENTS.includes(event.type)) {
    restructured.add(window);
    queueFlush();
  }
}

const listener = { handleEvent };

function listen(window: SyncWindow): void {
  for (const type of TAB_EVENTS) {
    window.addEventListener(type, listener, true);
  }
  window.addEventListener("activate", listener);
  window.addEventListener("SSWindowClosing", listener);
}

function unlisten(window: SyncWindow): void {
  for (const type of TAB_EVENTS) {
    window.removeEventListener(type, listener, true);
  }
  window.removeEventListener("activate", listener);
  window.removeEventListener("SSWindowClosing", listener);
}

// --- Windows coming and going -------------------------------------------------

// A closing window hands its pages to the most recent other window, so their
// history isn't lost with it; its entry in Recently closed windows would only
// repeat the tabs every window has, so it is forgotten.
function onWindowClosing(window: SyncWindow): void {
  windows.delete(window);
  unlisten(window);
  if (RunState.isQuitting) {
    return;
  }
  const target = windowsByRecency(window)[0];
  if (!target) {
    return;
  }
  // SessionStore collects the window's data after this event, so the mark
  // goes into its closed-window entry and identifies it there.
  let mark: string | null = newSyncId();
  try {
    SessionStore.setCustomWindowValue(window, CLOSING_MARK_KEY, mark);
  } catch (error) {
    console.error("[NWWindowSync] Couldn't mark the closing window:", error);
    mark = null;
  }
  for (const tab of liveTabs(window)) {
    const id = syncId(tab);
    if (holders.get(id) !== tab) {
      continue;
    }
    const instance = instanceIn(target, id);
    if (!instance) {
      continue;
    }
    try {
      const taker = takePage(instance, tab);
      holders.set(id, taker);
      removePlaceholder(taker);
    } catch (error) {
      console.error("[NWWindowSync] Couldn't keep a page of the closing window:", error);
    }
  }
  // Unmarked, its entry stays: an extra entry in Recently closed windows is
  // better than forgetting the wrong window.
  if (mark) {
    forgetClosedWindowSoon(mark);
  }
}

// SessionStore records the closed window after flushing it, and announces
// that a task later. When the desktop closes every window at shutdown, the
// next window (the one that just took the pages) has often closed by then
// and is the newest entry, so the entry is found by its mark, not its place.
// Forgetting the wrong one lost every page: Firefox reopens the windows
// closed in a row before quitting, which left only the mirrors.
function forgetClosedWindowSoon(mark: string): void {
  let done = false;
  const stop = () => {
    if (done) {
      return;
    }
    done = true;
    Services.obs.removeObserver(observer, "sessionstore-closed-objects-changed");
  };
  const observer = {
    observe(): void {
      const entry = SessionStore.getClosedWindowData().find((data) =>
        data.extData?.[CLOSING_MARK_KEY] === mark
      );
      if (!entry) {
        return;
      }
      stop();
      try {
        SessionStore.forgetClosedWindowById(entry.closedId);
      } catch (error) {
        console.error("[NWWindowSync] Couldn't forget the closed window:", error);
      }
    },
  };
  Services.obs.addObserver(observer, "sessionstore-closed-objects-changed");
  // Nothing was recorded if the window had no tabs worth saving.
  setTimeout(stop, 5000);
}

// Pairs a joining window's tabs with the synced windows' tabs and adds
// whatever either side is missing. For tabs both have, the instance with a
// page keeps it; ties go to the instance that already held it.
function join(window: SyncWindow): void {
  if (windows.has(window) || !isSyncable(window)) {
    return;
  }
  const reference = windowsByRecency(null)[0] ?? null;
  withApplying(() => {
    for (const tab of liveTabs(window)) {
      claimId(tab);
    }
    windows.add(window);
    listen(window);
    if (!reference) {
      for (const tab of liveTabs(window)) {
        holders.set(syncId(tab), tab);
      }
      return;
    }
    for (const tab of liveTabs(window)) {
      const id = syncId(tab);
      const current = holderOf(tab);
      if (!current) {
        // Only this window has it: it goes to the end of the others' list,
        // in its folder.
        holders.set(id, tab);
        for (const other of otherWindows(window)) {
          if (!instanceIn(other, id)) {
            const mirror = createMirror(other, tab);
            if (!tab.pinned) {
              syncMembership(tab, mirror, other);
            }
          }
        }
        continue;
      }
      if (contentScore(tab) > contentScore(current)) {
        demote(current);
        holders.set(id, tab);
        for (const other of otherWindows(window)) {
          const instance = instanceIn(other, id);
          if (instance) {
            copyLabel(tab, instance);
            copyIcon(tab, instance);
          }
        }
      } else {
        if (contentScore(tab) > 0) {
          demote(tab);
        }
        copyLabel(current, tab);
        copyIcon(current, tab);
        copyValues(current, tab);
        announceSynced(tab);
      }
    }
    // The joining window's own tabs went into the reference window above;
    // now the reference's order and structure applies to all.
    for (const tab of liveTabs(reference)) {
      if (!instanceIn(window, syncId(tab))) {
        createMirror(window, tab);
      }
    }
    for (const other of otherWindows(reference)) {
      syncStructure(reference, other);
    }
  });
}

async function whenReady(window: SyncWindow): Promise<void> {
  await SessionStore.promiseAllWindowsRestored;
  await window.delayedStartupPromise;
}

// Called by each window's neoworks-window-sync feature. Returns a function
// that stops syncing the window, for hot reload.
export function syncWindow(window: Window): () => void {
  const syncWindow = window as SyncWindow;
  watchPref();
  if (!isSyncable(syncWindow)) {
    return () => {};
  }
  pending.add(syncWindow);
  whenReady(syncWindow).then(() =>
    syncWindow.setTimeout(() => {
      if (!pending.delete(syncWindow) || !enabled() || syncWindow.closed) {
        return;
      }
      try {
        join(syncWindow);
        started = true;
        // The focused window may have been focused before it joined.
        const active = Services.focus.activeWindow as SyncWindow | null;
        if (active && windows.has(active)) {
          bringShownPages(active);
        }
      } catch (error) {
        console.error("[NWWindowSync] Couldn't sync the new window's tabs:", error);
      }
    }, 0)
  ).catch((error) => console.error("[NWWindowSync] Waiting for the window failed:", error));
  return () => {
    pending.delete(syncWindow);
    if (windows.delete(syncWindow)) {
      unlisten(syncWindow);
    }
  };
}

function rejoinAll(): void {
  for (const window of BrowserWindowTracker.orderedWindows) {
    if (!windows.has(window) && isSyncable(window) && window.gBrowser) {
      try {
        join(window);
      } catch (error) {
        console.error("[NWWindowSync] Couldn't sync a window's tabs:", error);
      }
    }
  }
}

// Turning sync off leaves every window with the tabs it has; turning it on
// merges them again.
function watchPref(): void {
  if (prefObserverAdded) {
    return;
  }
  prefObserverAdded = true;
  Services.prefs.addObserver(WINDOW_SYNC_PREF, {
    observe(): void {
      if (enabled()) {
        if (started) {
          inWindowTask(rejoinAll);
        }
        return;
      }
      for (const window of windows) {
        unlisten(window);
      }
      windows.clear();
      holders.clear();
    },
  });
}
