// SPDX-License-Identifier: MPL-2.0

// Background tabs that keep decoding video. Gecko's suspension of video in
// hidden tabs doesn't reach every video: get-spatial.com keeps twelve 2160p60
// AV1/H.264 loops decoding (only six of them are in the document) however long
// the tab stays in the background, several cores' worth without hardware
// decoding.
//
// Every SAMPLE_INTERVAL_MS this samples the CPU of each content process's
// video-decoding threads. A hidden tab that makes no sound but whose processes
// keep decoding for STRIKES samples in a row gets suspendMediaWhenInactive: Gecko
// then suspends all of its media, detached elements included, while the tab
// is inactive, and resumes it when the tab is selected. The flag isn't set on
// every background tab because it also holds back sound the page starts in
// the background (a chat's notification ping). It stays on the tab, so it is
// suspended again whenever it goes to the background, until the tab moves to
// another site or plays sound.

const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs",
) as { setTimeout: typeof globalThis.setTimeout };

const SAMPLE_INTERVAL_MS = 10_000;
// Decoding-thread CPU, as a share of one core, above which a hidden tab
// counts as decoding. get-spatial.com in the background: 0.02; a tab whose
// videos Gecko suspended: under 0.002.
const DECODING_CORE_SHARE = 0.01;
const STRIKES = 2;
// How long a suspended tab is marked active so its content process sees the
// visibility change (see suspend()).
const ACTIVITY_SETTLE_MS = 250;

// Threads that only work while video frames are decoded: the client that
// receives them from the decoder process (RDD) and dav1d when AV1 is decoded
// in the content process. The rest of the media pipeline (state machines,
// task queues) keeps ticking for suspended videos too.
const MEDIA_THREAD = /^(RemVidChild|dav1d)/;

interface ThreadSample {
  tid: number;
  name: string;
  cpuTime: number;
}

interface TabBrowsingContext {
  isActive: boolean;
  suspendMediaWhenInactive: boolean;
  mediaController: { isPlaying: boolean } | null;
  currentWindowGlobal: { osPid: number } | null;
  getAllBrowsingContextsInSubtree(): TabBrowsingContext[];
}

interface Browser {
  currentURI: { host?: string; spec: string };
  docShellIsActive: boolean;
  browsingContext: TabBrowsingContext | null;
}

interface Tab {
  linkedBrowser: Browser | null;
  soundPlaying: boolean;
  selected: boolean;
  // Set while the tab is part of a split view; null or undefined otherwise.
  splitview?: object | null;
  ownerDocument: { defaultView: BrowserWindow | null };
  hasAttribute(name: string): boolean;
}

interface BrowserWindow extends Window {
  gBrowser?: { tabs: Tab[]; selectedTab: Tab };
}

let watching = false;
let previous = new Map<number, Map<number, number>>();
let previousAt = 0;
const strikes = new WeakMap<Browser, number>();
// The host each suspended browser was on when it was suspended.
const suspendedHosts = new WeakMap<Browser, string>();

function host(browser: Browser): string {
  try {
    return browser.currentURI.host ?? "";
  } catch {
    return "";
  }
}

function browserTabs(): Tab[] {
  const tabs: Tab[] = [];
  for (const window of Services.wm.getEnumerator("navigator:browser")) {
    tabs.push(...((window as BrowserWindow).gBrowser?.tabs ?? []));
  }
  return tabs;
}

// The processes a tab's frames live in, cross-origin iframes included.
function tabProcesses(browser: Browser): Set<number> {
  const pids = new Set<number>();
  for (const context of browser.browsingContext?.getAllBrowsingContextsInSubtree() ?? []) {
    const pid = context.currentWindowGlobal?.osPid;
    if (pid !== undefined && pid > 0) {
      pids.add(pid);
    }
  }
  return pids;
}

function isAudible(tab: Tab): boolean {
  const controller = tab.linkedBrowser?.browsingContext?.mediaController;
  return tab.soundPlaying || Boolean(controller?.isPlaying);
}

// Media the user watches or shares outside the tab: picture-in-picture, a
// camera or screen share.
function isInUseElsewhere(tab: Tab): boolean {
  return tab.hasAttribute("pictureinpicture") || tab.hasAttribute("sharing");
}

// Decoding-thread CPU per content process since the last sample, as a share of
// one core.
async function sampleMediaLoad(): Promise<Map<number, number> | null> {
  const info = await ChromeUtils.requestProcInfo();
  const now = Date.now();
  const elapsedMs = now - previousAt;
  const current = new Map<number, Map<number, number>>();
  const load = new Map<number, number>();
  for (const child of info.children ?? []) {
    if (child.pid === undefined || !child.type?.startsWith("web")) {
      continue;
    }
    const threads = new Map<number, number>();
    const before = previous.get(child.pid);
    let decodingNs = 0;
    for (const thread of (child.threads ?? []) as ThreadSample[]) {
      if (!MEDIA_THREAD.test(thread.name ?? "")) {
        continue;
      }
      threads.set(thread.tid, thread.cpuTime);
      decodingNs += thread.cpuTime - (before?.get(thread.tid) ?? thread.cpuTime);
    }
    current.set(child.pid, threads);
    if (before) {
      load.set(child.pid, decodingNs / 1e6 / elapsedMs);
    }
  }
  const first = previousAt === 0;
  previous = current;
  previousAt = now;
  return first ? null : load;
}

// The selected tab and the other panes of its split view.
function isShown(tab: Tab): boolean {
  // ownerGlobal isn't available to system modules.
  const selected = tab.ownerDocument.defaultView?.gBrowser?.selectedTab;
  return tab.selected || (Boolean(tab.splitview) && selected?.splitview === tab.splitview);
}

async function suspend(tab: Tab, browser: Browser): Promise<void> {
  const context = browser.browsingContext;
  if (!context) {
    return;
  }
  context.suspendMediaWhenInactive = true;
  suspendedHosts.set(browser, host(browser));
  // Gecko applies the flag when the page's visibility changes, which the
  // content process works out asynchronously: a tab that is already in the
  // background is marked active long enough for that to see it, then
  // inactive again unless the user selected it meanwhile.
  context.isActive = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, ACTIVITY_SETTLE_MS));
  } finally {
    if (!isShown(tab)) {
      context.isActive = false;
    }
  }
  console.log("[NWBackgroundMedia] Suspended media in a background tab that kept decoding video:", host(browser));
}

function release(browser: Browser): void {
  const context = browser.browsingContext;
  if (context) {
    context.suspendMediaWhenInactive = false;
  }
  suspendedHosts.delete(browser);
}

async function check(): Promise<void> {
  const load = await sampleMediaLoad();
  const tabs = browserTabs();

  // Processes that also host a visible or audible tab: their decoding may be
  // that tab's, which is fine.
  const busyElsewhere = new Set<number>();
  for (const tab of tabs) {
    const browser = tab.linkedBrowser;
    if (browser && (browser.docShellIsActive || isAudible(tab) || isInUseElsewhere(tab))) {
      for (const pid of tabProcesses(browser)) {
        busyElsewhere.add(pid);
      }
    }
  }

  for (const tab of tabs) {
    const browser = tab.linkedBrowser;
    if (!browser?.browsingContext) {
      continue;
    }
    const suspendedHost = suspendedHosts.get(browser);
    if (suspendedHost !== undefined) {
      if (suspendedHost !== host(browser) || isAudible(tab)) {
        release(browser);
      }
      continue;
    }
    if (!load || browser.docShellIsActive || isAudible(tab) || isInUseElsewhere(tab)) {
      strikes.delete(browser);
      continue;
    }
    const decoding = [...tabProcesses(browser)].some((pid) =>
      !busyElsewhere.has(pid) && (load.get(pid) ?? 0) >= DECODING_CORE_SHARE
    );
    if (!decoding) {
      strikes.delete(browser);
      continue;
    }
    const count = (strikes.get(browser) ?? 0) + 1;
    strikes.set(browser, count);
    if (count >= STRIKES) {
      strikes.delete(browser);
      await suspend(tab, browser);
    }
  }
}

// The next check starts after this one finished, never alongside it.
async function checkAndReschedule(): Promise<void> {
  try {
    await check();
  } catch (error) {
    console.error("[NWBackgroundMedia] Background media check failed:", error);
  }
  setTimeout(checkAndReschedule, SAMPLE_INTERVAL_MS);
}

// One watch for all windows; later calls do nothing.
export function watchBackgroundMedia(): void {
  if (watching) {
    return;
  }
  watching = true;
  checkAndReschedule();
}
