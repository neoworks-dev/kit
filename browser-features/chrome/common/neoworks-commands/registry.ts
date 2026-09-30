// SPDX-License-Identifier: MPL-2.0

import {
  NW_COMMAND_TITLES,
  type NWCommandId,
  type NWCommandInvocation,
} from "#features-modules/common/NWKeymap.ts";

// Titles live in NW_COMMAND_TITLES, shared with the settings page.
export interface NeoworksCommand {
  id: NWCommandId;
  // Listed commands show up in the spotlight; the rest need an argument.
  listed: boolean;
  run(invocation: NWCommandInvocation): void;
}

const commands = new Map<NWCommandId, NeoworksCommand>();

// Returns an unregister function so features can clean up on hot reload.
export function registerCommands(newCommands: NeoworksCommand[]): () => void {
  for (const command of newCommands) {
    commands.set(command.id, command);
  }
  return () => {
    for (const command of newCommands) {
      if (commands.get(command.id) === command) {
        commands.delete(command.id);
      }
    }
  };
}

export function runCommand(invocation: NWCommandInvocation): void {
  const command = commands.get(invocation.command);
  if (!command) {
    console.error("[neoworks-commands] Unknown command", invocation.command);
    return;
  }
  try {
    command.run(invocation);
  } catch (error) {
    console.error(`[neoworks-commands] "${invocation.command}" failed:`, error);
  }
}

export function listedCommands(): NeoworksCommand[] {
  return Array.from(commands.values()).filter((command) => command.listed);
}

export function commandTitle(id: NWCommandId): string {
  return NW_COMMAND_TITLES[id];
}
