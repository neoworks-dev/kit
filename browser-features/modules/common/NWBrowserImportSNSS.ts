// SPDX-License-Identifier: MPL-2.0

// Reads the open tabs out of a Chromium session file (SNSS), for the browser
// import (NWBrowserImport.sys.mts). No Firefox APIs here, so it also runs
// under Deno.
//
// The file is "SNSS", an int32 version, then commands of
// `uint16 size, uint8 id, payload` (size counts the id byte). A session file
// is a log: it starts with the full state and appends changes, so replaying
// every command gives the state at the time it was last written. Payloads are
// either plain structs of int32s or a Pickle (a uint32 payload length, then
// 4-byte aligned fields). Command ids are from Chromium's
// components/sessions/core/session_service_commands.cc.

export interface SessionTab {
  url: string;
  title: string;
  pinned: boolean;
}

const CMD_SET_TAB_WINDOW = 0;
const CMD_SET_TAB_INDEX_IN_WINDOW = 2;
const CMD_PRUNED_FROM_BACK = 5;
const CMD_UPDATE_TAB_NAVIGATION = 6;
const CMD_SET_SELECTED_NAVIGATION_INDEX = 7;
const CMD_SET_WINDOW_TYPE = 9;
const CMD_PRUNED_FROM_FRONT = 11;
const CMD_SET_PINNED_STATE = 12;
const CMD_TAB_CLOSED = 16;
const CMD_WINDOW_CLOSED = 17;
const CMD_NAVIGATION_PATH_PRUNED = 24;

// Versions 1 and 3 are plain; 2 and 4 are encrypted and can't be read.
const READABLE_VERSIONS = new Set([1, 3]);
const WINDOW_TYPE_NORMAL = 0;

interface Navigation {
  url: string;
  title: string;
}

interface TabState {
  // Order of first appearance, to break ties between equal indexes.
  seen: number;
  windowId: number | null;
  index: number;
  selected: number | null;
  pinned: boolean;
  navigations: Map<number, Navigation>;
}

interface WindowState {
  seen: number;
  type: number;
}

// Bounds-checked little-endian reads over one command's payload.
class Reader {
  #view: DataView;
  #bytes: Uint8Array;
  offset = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  int32(): number {
    if (this.offset + 4 > this.#bytes.length) {
      throw new RangeError("Truncated command");
    }
    const value = this.#view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  byte(at: number): number {
    if (at >= this.#bytes.length) {
      throw new RangeError("Truncated command");
    }
    return this.#bytes[at];
  }

  #take(length: number): Uint8Array {
    if (length < 0 || this.offset + length > this.#bytes.length) {
      throw new RangeError("Truncated command");
    }
    const slice = this.#bytes.subarray(this.offset, this.offset + length);
    // Pickle fields are padded to 4 bytes.
    this.offset += (length + 3) & ~3;
    return slice;
  }

  string(): string {
    return new TextDecoder().decode(this.#take(this.int32()));
  }

  string16(): string {
    const bytes = this.#take(this.int32() * 2);
    return new TextDecoder("utf-16le").decode(bytes);
  }
}

const IMPORTABLE_SCHEMES = new Set(["http:", "https:", "file:"]);

// Only pages that load the same in Kit: not chrome://, about:, extension
// pages and the like.
export function isImportableTabUrl(url: string): boolean {
  try {
    return IMPORTABLE_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

// Open tabs in window order, then tab order. Throws if the data isn't a
// readable session file.
export function parseSessionFile(data: Uint8Array): SessionTab[] {
  if (data.length < 8 || new TextDecoder().decode(data.subarray(0, 4)) !== "SNSS") {
    throw new Error("Not a session file");
  }
  const version = new DataView(data.buffer, data.byteOffset + 4, 4).getInt32(0, true);
  if (!READABLE_VERSIONS.has(version)) {
    throw new Error(`Unsupported session file version ${version}`);
  }

  const tabs = new Map<number, TabState>();
  const windows = new Map<number, WindowState>();
  let seen = 0;

  const tab = (id: number): TabState => {
    let state = tabs.get(id);
    if (!state) {
      state = {
        seen: seen++,
        windowId: null,
        index: 0,
        selected: null,
        pinned: false,
        navigations: new Map(),
      };
      tabs.set(id, state);
    }
    return state;
  };
  const window = (id: number): WindowState => {
    let state = windows.get(id);
    if (!state) {
      state = { seen: seen++, type: WINDOW_TYPE_NORMAL };
      windows.set(id, state);
    }
    return state;
  };
  // Drops navigations matching `drop` and renumbers the rest with `shift`.
  const renumber = (
    state: TabState,
    drop: (index: number) => boolean,
    shift: (index: number) => number,
  ): void => {
    const kept = new Map<number, Navigation>();
    for (const [index, navigation] of state.navigations) {
      if (!drop(index)) {
        kept.set(shift(index), navigation);
      }
    }
    state.navigations = kept;
    if (state.selected !== null) {
      state.selected = shift(state.selected);
    }
  };

  let offset = 8;
  while (offset + 2 <= data.length) {
    const size = data[offset] | (data[offset + 1] << 8);
    offset += 2;
    if (size === 0 || offset + size > data.length) {
      // A command cut off by a crash mid-write; everything before it is fine.
      break;
    }
    const id = data[offset];
    const payload = new Reader(data.subarray(offset + 1, offset + size));
    offset += size;

    try {
      switch (id) {
        case CMD_SET_TAB_WINDOW: {
          const windowId = payload.int32();
          window(windowId);
          tab(payload.int32()).windowId = windowId;
          break;
        }
        case CMD_SET_TAB_INDEX_IN_WINDOW: {
          const state = tab(payload.int32());
          state.index = payload.int32();
          break;
        }
        case CMD_UPDATE_TAB_NAVIGATION: {
          // Skip the Pickle's payload length.
          payload.int32();
          const state = tab(payload.int32());
          const index = payload.int32();
          const url = payload.string();
          const title = payload.string16();
          state.navigations.set(index, { url, title });
          break;
        }
        case CMD_SET_SELECTED_NAVIGATION_INDEX: {
          const state = tab(payload.int32());
          state.selected = payload.int32();
          break;
        }
        case CMD_SET_WINDOW_TYPE: {
          const state = window(payload.int32());
          state.type = payload.int32();
          break;
        }
        case CMD_SET_PINNED_STATE: {
          const state = tab(payload.int32());
          // A bool right after the tab id.
          state.pinned = payload.byte(4) !== 0;
          break;
        }
        case CMD_TAB_CLOSED:
          tabs.delete(payload.int32());
          break;
        case CMD_WINDOW_CLOSED: {
          const windowId = payload.int32();
          windows.delete(windowId);
          for (const [tabId, state] of tabs) {
            if (state.windowId === windowId) {
              tabs.delete(tabId);
            }
          }
          break;
        }
        case CMD_PRUNED_FROM_BACK: {
          const state = tab(payload.int32());
          const index = payload.int32();
          renumber(state, (i) => i >= index, (i) => i);
          break;
        }
        case CMD_PRUNED_FROM_FRONT: {
          const state = tab(payload.int32());
          const count = payload.int32();
          renumber(state, (i) => i < count, (i) => i - count);
          break;
        }
        case CMD_NAVIGATION_PATH_PRUNED: {
          const state = tab(payload.int32());
          const index = payload.int32();
          const count = payload.int32();
          renumber(
            state,
            (i) => i >= index && i < index + count,
            (i) => (i >= index + count ? i - count : i),
          );
          break;
        }
      }
    } catch {
      // A malformed command; skip it rather than losing the whole session.
    }
  }

  const result: { window: WindowState; state: TabState; nav: Navigation }[] = [];
  for (const state of tabs.values()) {
    const win = state.windowId === null ? undefined : windows.get(state.windowId);
    if (!win || win.type !== WINDOW_TYPE_NORMAL) {
      continue;
    }
    const nav = selectedNavigation(state);
    if (nav && isImportableTabUrl(nav.url)) {
      result.push({ window: win, state, nav });
    }
  }
  result.sort((a, b) =>
    a.window.seen - b.window.seen || a.state.index - b.state.index ||
    a.state.seen - b.state.seen
  );
  return result.map(({ state, nav }) => ({
    url: nav.url,
    title: nav.title,
    pinned: state.pinned,
  }));
}

// The navigation the tab was showing, or the closest one before it.
function selectedNavigation(state: TabState): Navigation | undefined {
  const indexes = [...state.navigations.keys()].sort((a, b) => a - b);
  if (!indexes.length) {
    return undefined;
  }
  const wanted = state.selected ?? indexes[indexes.length - 1];
  const at = indexes.filter((i) => i <= wanted);
  return state.navigations.get(at.length ? at[at.length - 1] : indexes[0]);
}
