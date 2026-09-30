// SPDX-License-Identifier: MPL-2.0

import { type Accessor, createSignal, onCleanup } from "solid-js";
import { loadLayout, saveLayout } from "./store.ts";
import type { NewTabLayout } from "./types.ts";

// The saved layout. While `editing`, the pref isn't re-read when the tab
// regains focus, so edits in progress stay put.
export function createLayout(editing: Accessor<boolean>): {
  layout: Accessor<NewTabLayout>;
  update: (change: (layout: NewTabLayout) => NewTabLayout) => void;
} {
  const [layout, setLayout] = createSignal(loadLayout());

  // Another new tab may have changed the layout while this one was hidden.
  const onVisibility = () => {
    if (document.visibilityState === "visible" && !editing()) {
      setLayout(loadLayout());
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  onCleanup(() => {
    document.removeEventListener("visibilitychange", onVisibility);
  });

  const update = (change: (layout: NewTabLayout) => NewTabLayout) => {
    const current = layout();
    const next = change(current);
    if (next === current) return;
    setLayout(next);
    saveLayout(next);
  };

  return { layout, update };
}
