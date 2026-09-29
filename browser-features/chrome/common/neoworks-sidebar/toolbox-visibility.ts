// SPDX-License-Identifier: MPL-2.0

import { createSignal } from "solid-js";

const HIDE_TOOLBOX_PREF = "neoworks.sidebar.hideToolbox";
const HIDE_TOOLBOX_ATTRIBUTE = "neoworks-hide-toolbox";

const [toolboxHidden, setToolboxHidden] = createSignal(
  Services.prefs.getBoolPref(HIDE_TOOLBOX_PREF, true),
);

export { toolboxHidden };

export function applyToolboxVisibility(): void {
  document.documentElement?.toggleAttribute(
    HIDE_TOOLBOX_ATTRIBUTE,
    toolboxHidden(),
  );
}

export function toggleToolbox(): void {
  const hidden = !toolboxHidden();
  Services.prefs.setBoolPref(HIDE_TOOLBOX_PREF, hidden);
  setToolboxHidden(hidden);
  applyToolboxVisibility();
}

export function restoreToolbox(): void {
  document.documentElement?.removeAttribute(HIDE_TOOLBOX_ATTRIBUTE);
}
