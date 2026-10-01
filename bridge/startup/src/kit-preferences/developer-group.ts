// SPDX-License-Identifier: MPL-2.0

// "Developer": settings for working on code with Kit. For now the one that
// lets Grove's coding agents drive Kit tabs (NWGrove.sys.mts), off by
// default. Off, Kit doesn't look for Grove at all; turning it off withdraws
// every tab from Grove and disconnects.

import type { PreferencesWindow, SettingGroupConfig } from "./types.ts";

const GROVE_ENABLED_PREF = "neoworks.grove.enabled";

export const DEVELOPER_GROUP_ID = "kitDeveloper";

const GROUP: SettingGroupConfig = {
  controlAttrs: {
    label: "Developer",
  },
  headingLevel: 2,
  items: [
    {
      id: "kitGroveEnabled",
      control: "moz-toggle",
      controlAttrs: {
        label: "Connect to Grove",
        description:
          "Let the coding agents in Grove use the tabs you hand them. Kit pairs with Grove once, when you approve it there.",
      },
    },
  ],
};

export function registerDeveloperGroup(win: PreferencesWindow): void {
  win.Preferences.addAll([{ id: GROVE_ENABLED_PREF, type: "bool" }]);
  win.Preferences.addSetting({
    id: "kitGroveEnabled",
    pref: GROVE_ENABLED_PREF,
    get: (prefValue) => prefValue === true,
  });
  win.SettingGroupManager.registerGroups({ [DEVELOPER_GROUP_ID]: GROUP });
}
