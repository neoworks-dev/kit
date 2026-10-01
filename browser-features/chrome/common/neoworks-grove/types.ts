// SPDX-License-Identifier: MPL-2.0

export type GroveState = "off" | "searching" | "connecting" | "pairing" | "connected" | "denied";

export interface GroveWorktree {
  id: string;
  name: string;
  branch: string;
  path: string;
}

// The tab menu's list: loading, the worktrees, or why there are none.
export type WorktreeList =
  | { kind: "loading" }
  | { kind: "ready"; worktrees: GroveWorktree[] }
  | { kind: "failed"; message: string };
