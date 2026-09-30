// SPDX-License-Identifier: MPL-2.0

// Firefox shortcuts that Kit redirects to its own commands. Firefox handles
// these in a bubbling "command" listener on #mainCommandSet, so a capturing
// listener on the same element runs first and can stop it.

import type { NWCommandInvocation } from "#features-modules/common/NWKeymap.ts";

// Only the Ctrl+T key element uses cmd_newNavigatorTabNoEvent; the new-tab
// button and menu items use cmd_newNavigatorTab and keep opening a tab.
// Tools:Downloads (Ctrl+Shift+Y and the Downloads menu items) opens Kit's
// downloads panel instead of the Library window.
const REDIRECTED_COMMANDS: Record<string, NWCommandInvocation> = {
  cmd_newNavigatorTabNoEvent: { command: "spotlight:open" },
  "Tools:Downloads": { command: "downloads:open" },
};

export function redirectNativeShortcuts(
  run: (invocation: NWCommandInvocation) => void,
): () => void {
  const commandSet = document.getElementById("mainCommandSet");
  if (!commandSet) {
    console.error("[neoworks-commands] #mainCommandSet is missing.");
    return () => {};
  }

  function handleCommand(event: Event): void {
    const target = event.target as Element | null;
    if (!target) {
      return;
    }
    const invocation = REDIRECTED_COMMANDS[target.id];
    if (!invocation) {
      return;
    }
    event.stopPropagation();
    run(invocation);
  }

  commandSet.addEventListener("command", handleCommand, true);
  return () => commandSet.removeEventListener("command", handleCommand, true);
}
