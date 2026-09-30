// SPDX-License-Identifier: MPL-2.0

import { registerWidget } from "../registry.ts";
import { clockWidget } from "./clock.tsx";
import { searchWidget } from "./search.tsx";
import { shortcutsWidget } from "./shortcuts.tsx";

export function registerBuiltinWidgets(): () => void {
  const unregister = [clockWidget, searchWidget, shortcutsWidget].map(
    registerWidget,
  );
  return () => unregister.forEach((fn) => fn());
}
