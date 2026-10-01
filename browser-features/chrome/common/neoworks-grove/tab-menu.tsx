// SPDX-License-Identifier: MPL-2.0

// The tab menu's Grove entries (in neoworks-sidebar/context-menu.tsx): hand
// the tab to one of Grove's worktrees, or take it back. Only there while the
// developer setting is on.

import { createSignal, For, Match, Show, Switch } from "solid-js";
import { groveEnabled, groveModule, groveState, stateNote } from "./grove.ts";
import type { GroveWorktree, WorktreeList } from "./types.ts";

interface MenuTab extends Element {
  linkedBrowser: XULBrowserElement;
}

const [list, setList] = createSignal<WorktreeList>({ kind: "loading" });

async function loadWorktrees(): Promise<void> {
  setList({ kind: "loading" });
  try {
    setList({ kind: "ready", worktrees: await groveModule().groveWorktrees() });
  } catch (error) {
    console.error("[neoworks-grove] Couldn't list Grove's worktrees:", error);
    setList({ kind: "failed", message: "Grove didn't list its worktrees" });
  }
}

function provide(tab: MenuTab, worktree: { id: string; name: string }): void {
  groveModule().provideTab(tab.linkedBrowser, worktree).catch((error: unknown) => {
    console.error("[neoworks-grove] Couldn't hand the tab to Grove:", error);
  });
}

function readyWorktrees(): GroveWorktree[] {
  const current = list();
  return current.kind === "ready" ? current.worktrees : [];
}

function failure(): string {
  const current = list();
  return current.kind === "failed" ? current.message : "";
}

// The worktree's name, with its branch when that says something more.
function worktreeLabel(worktree: GroveWorktree): string {
  if (!worktree.branch || worktree.branch === worktree.name) {
    return worktree.name;
  }
  return `${worktree.name} (${worktree.branch})`;
}

function WorktreeItems(props: { tab: () => MenuTab | null }) {
  return (
    <Switch>
      <Match when={groveState() !== "connected"}>
        <xul:menuitem label={stateNote(groveState())} disabled />
        <Show when={groveState() === "denied"}>
          <xul:menuitem label="Ask Grove again" onCommand={() => groveModule().reconnectGrove()} />
        </Show>
      </Match>
      <Match when={list().kind === "loading"}>
        <xul:menuitem label="Loading worktrees…" disabled />
      </Match>
      <Match when={failure()}>
        <xul:menuitem label={failure()} disabled />
      </Match>
      <Match when={readyWorktrees().length === 0}>
        <xul:menuitem label="Grove has no worktrees open" disabled />
      </Match>
      <Match when={readyWorktrees().length > 0}>
        <For each={readyWorktrees()}>
          {(worktree) => (
            <xul:menuitem
              label={worktreeLabel(worktree)}
              onCommand={() => {
                const tab = props.tab();
                if (tab) {
                  provide(tab, worktree);
                }
              }}
            />
          )}
        </For>
      </Match>
    </Switch>
  );
}

export function GroveTabMenu(props: { tab: () => Element | null; revision: () => number }) {
  const menuTab = () => props.tab() as MenuTab | null;
  const servedWorktree = () => {
    props.revision();
    return menuTab()?.getAttribute("nw-grove") ?? null;
  };
  return (
    <Show when={groveEnabled()}>
      <Show
        when={servedWorktree()}
        fallback={
          <xul:menu label="Hand to Grove">
            <xul:menupopup
              onPopupShowing={(event: Event) => {
                if (event.target === event.currentTarget && groveState() === "connected") {
                  void loadWorktrees();
                }
              }}
            >
              <WorktreeItems tab={menuTab} />
            </xul:menupopup>
          </xul:menu>
        }
      >
        {(worktree) => (
          <xul:menuitem
            label={`Take back from Grove (${worktree()})`}
            onCommand={() => {
              const tab = menuTab();
              if (tab) {
                void groveModule().withdrawTab(tab.linkedBrowser);
              }
            }}
          />
        )}
      </Show>
    </Show>
  );
}
