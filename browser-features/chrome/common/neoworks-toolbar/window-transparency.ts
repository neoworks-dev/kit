// SPDX-License-Identifier: MPL-2.0

// Opt-in see-through window chrome. Off by default: over bright or busy
// desktops glass costs readability, and it only blurs where the compositor
// supports it. The root attribute switches neoworks-ui/frame.css.

const TRANSPARENT_PREF = "neoworks.window.transparent";
const TRANSPARENT_BY_DEFAULT = false;
const TRANSPARENT_ATTRIBUTE = "nw-window-transparent";

function readTransparent(): boolean {
  return Services.prefs.getBoolPref(TRANSPARENT_PREF, TRANSPARENT_BY_DEFAULT);
}

function applyTransparent(): void {
  document.documentElement.toggleAttribute(TRANSPARENT_ATTRIBUTE, readTransparent());
}

export function toggleWindowTransparency(): void {
  Services.prefs.setBoolPref(TRANSPARENT_PREF, !readTransparent());
}

// Returns a stop function for hot reload.
export function watchWindowTransparency(): () => void {
  const observer = { observe: applyTransparent };
  Services.prefs.addObserver(TRANSPARENT_PREF, observer);
  applyTransparent();
  return () => {
    Services.prefs.removeObserver(TRANSPARENT_PREF, observer);
    document.documentElement.removeAttribute(TRANSPARENT_ATTRIBUTE);
  };
}
