// SPDX-License-Identifier: MPL-2.0

// Grove's tabs live in a workspace per worktree, named after it and marked
// with a branch icon. Which workspace belongs to which worktree is kept by
// worktree id (its path) in neoworks.grove.workspaces, so a renamed
// workspace stays the worktree's. The workspace shares the default container:
// the agent works with the user's own logins, as in the user's own tabs.

import { NO_CONTAINER } from "../neoworks-sidebar/containers.ts";
import { addWorkspace, openTabInWorkspace, workspaceById } from "../neoworks-sidebar/workspaces.ts";
import type { BrowserTab } from "../neoworks-sidebar/types.ts";

const WORKSPACES_PREF = "neoworks.grove.workspaces";
export const GROVE_WORKSPACE_ICON = "git-branch";

function readMap(): Record<string, string> {
  try {
    const parsed = JSON.parse(Services.prefs.getStringPref(WORKSPACES_PREF, "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // A broken map only costs a new workspace.
  }
  return {};
}

function workspaceFor(worktree: { id: string; name: string }): string {
  const map = readMap();
  const existing = map[worktree.id];
  if (existing && workspaceById(existing)) {
    return existing;
  }
  const workspace = addWorkspace(worktree.name, GROVE_WORKSPACE_ICON, NO_CONTAINER);
  map[worktree.id] = workspace.id;
  Services.prefs.setStringPref(WORKSPACES_PREF, JSON.stringify(map));
  return workspace.id;
}

// browser.open: a background tab in the worktree's workspace. The user's
// view stays where it is; the workspace switcher shows the new tab.
export function openWorktreeTab(worktree: { id: string; name: string }, url: string): BrowserTab {
  return openTabInWorkspace(workspaceFor(worktree), url);
}
