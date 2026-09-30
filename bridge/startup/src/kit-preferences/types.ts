// SPDX-License-Identifier: MPL-2.0

// The parts of about:preferences' settings framework (Firefox 157 settings
// redesign: Preferences.mjs, SettingGroupManager, SettingPaneManager) that
// Kit's pane uses. Labels are plain text through controlAttrs, so Kit needs no
// Fluent strings.

export interface PreferenceDeclaration {
  id: string;
  type: "bool" | "string" | "int";
}

export interface SettingDefinition {
  id: string;
  pref?: string;
  // Pref value to control value.
  get?(prefValue: unknown): unknown;
  // Control value to pref value.
  set?(controlValue: unknown): unknown;
}

export interface TextAttributes {
  label?: string;
  description?: string;
  href?: string;
}

export interface SettingOption {
  value: string;
  controlAttrs: TextAttributes;
}

export interface SettingItem {
  id: string;
  control: string;
  controlAttrs?: TextAttributes;
  options?: SettingOption[];
}

export interface SettingGroupConfig {
  controlAttrs: TextAttributes;
  headingLevel?: number;
  items: SettingItem[];
}

export interface SettingPaneConfig {
  iconSrc?: string;
  groupIds: string[];
}

export interface PreferencesWindow {
  Preferences: {
    addAll(preferences: PreferenceDeclaration[]): void;
    addSetting(setting: SettingDefinition): void;
  };
  SettingGroupManager: {
    registerGroups(groups: Record<string, SettingGroupConfig>): void;
  };
  SettingPaneManager: {
    registerPane(id: string, config: SettingPaneConfig): void;
  };
}
