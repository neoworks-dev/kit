// SPDX-License-Identifier: MPL-2.0

// Firefox shows only the window controls the desktop's button layout lists
// (GTK's gtk-decoration-layout), so tiling desktops often get a lone close
// button. Opt-in: show minimize and maximize anyway. The root attribute
// switches toolbar.css.

const ALL_CONTROLS_PREF = "neoworks.window.allControls";
const ALL_CONTROLS_BY_DEFAULT = false;
const ALL_CONTROLS_ATTRIBUTE = "nw-all-window-controls";

function readAllControls(): boolean {
  return Services.prefs.getBoolPref(ALL_CONTROLS_PREF, ALL_CONTROLS_BY_DEFAULT);
}

function applyAllControls(): void {
  document.documentElement.toggleAttribute(ALL_CONTROLS_ATTRIBUTE, readAllControls());
}

// Returns a stop function for hot reload.
export function watchWindowControls(): () => void {
  const observer = { observe: applyAllControls };
  Services.prefs.addObserver(ALL_CONTROLS_PREF, observer);
  applyAllControls();
  return () => {
    Services.prefs.removeObserver(ALL_CONTROLS_PREF, observer);
    document.documentElement.removeAttribute(ALL_CONTROLS_ATTRIBUTE);
  };
}
