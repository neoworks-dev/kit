// SPDX-License-Identifier: MPL-2.0

import { ContextualIdentityService } from "./containers.ts";
import { activeWorkspace } from "./workspaces.ts";

// Firefox's container and tab group color names, as hex swatches.
const NAMED_COLORS: Record<string, string> = {
  blue: "#37adff",
  turquoise: "#00c79a",
  cyan: "#00c79a",
  green: "#51cd00",
  yellow: "#ffcb00",
  orange: "#ff9f00",
  red: "#ff613d",
  pink: "#ff4bda",
  purple: "#af51f5",
  gray: "#9e9e9e",
};

export function namedColor(colorName: string): string {
  const color = NAMED_COLORS[colorName];
  if (!color) {
    return "var(--text-dim)";
  }
  return color;
}

export function containerColor(userContextId: number): string | null {
  if (!userContextId) {
    return null;
  }
  const identity = ContextualIdentityService.getPublicIdentityFromId(
    userContextId,
  );
  if (!identity) {
    return null;
  }
  return namedColor(identity.color);
}

// Container color for a tab marker, or null when the tab uses its
// workspace's own container: then every tab would carry the same marker, so
// it's only shown for tabs that differ.
export function foreignContainerColor(userContextId: number): string | null {
  if (userContextId === activeWorkspace().userContextId) {
    return null;
  }
  return containerColor(userContextId);
}
