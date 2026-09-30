// SPDX-License-Identifier: MPL-2.0

// "Workspace containers": which container each workspace opens new tabs in.
// Writes the workspace list pref that neoworks-sidebar/workspaces.ts observes.

import {
  DEFAULT_WORKSPACE,
  parseWorkspaces,
  withWorkspaceContainer,
  WORKSPACES_PREF,
} from "../../../../browser-features/chrome/common/neoworks-sidebar/workspace-model.ts";
import type { Workspace } from "../../../../browser-features/chrome/common/neoworks-sidebar/types.ts";
import type {
  PreferencesWindow,
  SettingItem,
  SettingOption,
} from "./types.ts";

export const WORKSPACE_CONTAINERS_GROUP_ID = "kitWorkspaceContainers";

const NO_CONTAINER = 0;

interface ContextualIdentity {
  userContextId: number;
}

const { ContextualIdentityService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs",
) as {
  ContextualIdentityService: {
    getPublicIdentities(): ContextualIdentity[];
    getUserContextLabel(userContextId: number): string;
  };
};

function parseStored(json: unknown): Workspace[] {
  if (typeof json !== "string") {
    return [DEFAULT_WORKSPACE];
  }
  return parseWorkspaces(json, [DEFAULT_WORKSPACE]);
}

function readWorkspaces(): Workspace[] {
  return parseStored(Services.prefs.getStringPref(WORKSPACES_PREF, "[]"));
}

function containerOptions(): SettingOption[] {
  const identities = ContextualIdentityService.getPublicIdentities().map((identity) => ({
    value: String(identity.userContextId),
    controlAttrs: {
      label: ContextualIdentityService.getUserContextLabel(identity.userContextId),
    },
  }));
  return [{ value: String(NO_CONTAINER), controlAttrs: { label: "No container" } }, ...identities];
}

function settingIdFor(workspace: Workspace): string {
  return `kitWorkspaceContainer-${workspace.id}`;
}

function containerOf(workspaceId: string, json: unknown): string {
  const workspace = parseStored(json).find((candidate) => candidate.id === workspaceId);
  if (!workspace) {
    return String(NO_CONTAINER);
  }
  return String(workspace.userContextId);
}

function registerWorkspaceSetting(win: PreferencesWindow, workspace: Workspace): void {
  win.Preferences.addSetting({
    id: settingIdFor(workspace),
    pref: WORKSPACES_PREF,
    get: (json) => containerOf(workspace.id, json),
    set: (userContextId) => {
      const updated = withWorkspaceContainer(
        readWorkspaces(),
        workspace.id,
        Number(userContextId),
      );
      return JSON.stringify(updated);
    },
  });
}

function workspaceItem(workspace: Workspace, options: SettingOption[]): SettingItem {
  return {
    id: settingIdFor(workspace),
    control: "moz-select",
    controlAttrs: { label: workspace.name },
    options,
  };
}

// Workspaces created while the page is open show up after a reload.
export function registerWorkspaceContainersGroup(win: PreferencesWindow): void {
  win.Preferences.addAll([{ id: WORKSPACES_PREF, type: "string" }]);
  const workspaces = readWorkspaces();
  const options = containerOptions();
  for (const workspace of workspaces) {
    registerWorkspaceSetting(win, workspace);
  }
  win.SettingGroupManager.registerGroups({
    [WORKSPACE_CONTAINERS_GROUP_ID]: {
      controlAttrs: {
        label: "Workspace containers",
        description: "New tabs in a workspace open in the container chosen here. " +
          "Create, rename and delete workspaces from the sidebar.",
      },
      headingLevel: 2,
      items: workspaces.map((workspace) => workspaceItem(workspace, options)),
    },
  });
}
