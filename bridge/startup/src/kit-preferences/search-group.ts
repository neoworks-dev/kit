// SPDX-License-Identifier: MPL-2.0

// "Search": the default search engine, which the spotlight searches with and
// names (neoworks-spotlight/engine.ts). The same setting as Firefox's search
// pane, built the way that pane builds it (preferences/config/search.mjs).

import type { PreferencesWindow, SettingGroupConfig } from "./types.ts";

interface SearchEngine {
  id: string;
  name: string;
  getIconURL(preferredWidth?: number): Promise<string | undefined>;
}

interface SearchServiceApi {
  getDefault(): Promise<SearchEngine>;
  getVisibleEngines(): Promise<SearchEngine[]>;
  getEngineById(id: string): SearchEngine | null;
  setDefault(engine: SearchEngine, reason: number): Promise<void>;
  CHANGE_REASON: { USER: number };
}

const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs",
) as { SearchService: SearchServiceApi };

// SearchUtils.TOPIC_ENGINE_MODIFIED: engines added, removed or made default.
const ENGINE_MODIFIED_TOPIC = "browser-search-engine-modified";

const ENGINE_SETTING_ID = "kitDefaultEngine";
export const SEARCH_GROUP_ID = "kitSearch";

const GROUP: SettingGroupConfig = {
  controlAttrs: {
    label: "Search",
    description:
      "Type a !bang in the spotlight, like !yt cats or !w Berlin, to search a site directly. Kit knows the bangs of over 10,000 sites.",
  },
  headingLevel: 2,
  items: [
    {
      id: ENGINE_SETTING_ID,
      control: "moz-select",
      controlAttrs: {
        label: "Search engine",
        description:
          "Used for searches from the spotlight and the address bar.",
      },
    },
  ],
};

async function engineOption(engine: SearchEngine) {
  return {
    value: engine.id,
    controlAttrs: { label: engine.name },
    iconSrc: await engine.getIconURL(),
  };
}

export function registerSearchGroup(win: PreferencesWindow): void {
  const { Preferences, SettingGroupManager } = win;

  class DefaultEngineSetting extends Preferences.AsyncSetting {
    static id = ENGINE_SETTING_ID;
    defaultGetControlConfig = { options: [] };

    async get(): Promise<string> {
      return (await SearchService.getDefault()).id;
    }

    async set(id: unknown): Promise<void> {
      const engine = SearchService.getEngineById(String(id));
      if (!engine) {
        console.error("[kit-preferences] No search engine with id", id);
        return;
      }
      await SearchService.setDefault(engine, SearchService.CHANGE_REASON.USER);
    }

    async getControlConfig() {
      const engines = await SearchService.getVisibleEngines();
      const options = await Promise.allSettled(engines.map(engineOption));
      return {
        options: options
          .filter((option) => option.status === "fulfilled")
          .map((option) => option.value),
      };
    }

    setup(): () => void {
      Services.obs.addObserver(this, ENGINE_MODIFIED_TOPIC);
      return () => Services.obs.removeObserver(this, ENGINE_MODIFIED_TOPIC);
    }

    observe(): void {
      this.emitChange();
    }
  }

  Preferences.addSetting(DefaultEngineSetting);
  SettingGroupManager.registerGroups({ [SEARCH_GROUP_ID]: GROUP });
}
