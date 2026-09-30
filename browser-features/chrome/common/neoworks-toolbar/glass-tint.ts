// SPDX-License-Identifier: MPL-2.0

// How strongly glass surfaces (sidebar, spotlight, menus) and the transparent
// window frame are tinted: lighter shows more of what is behind them,
// stronger reads better over busy pages. Set from Kit's settings pane.

export const GLASS_TINT_PREF = "neoworks.glass.tint";
const DEFAULT_TINT = "medium";

// Alpha of the dark tint over glass panels and over the transparent frame.
const TINT_LEVELS: Record<string, { glass: number; frame: number }> = {
  light: { glass: 0.5, frame: 0.4 },
  medium: { glass: 0.68, frame: 0.6 },
  strong: { glass: 0.85, frame: 0.8 },
};

function readTint(): { glass: number; frame: number } {
  const level = TINT_LEVELS[Services.prefs.getStringPref(GLASS_TINT_PREF, DEFAULT_TINT)];
  if (!level) {
    return TINT_LEVELS[DEFAULT_TINT];
  }
  return level;
}

// Consumed by neoworks-ui/glass.css and neoworks-ui/frame.css.
function applyTint(): void {
  const tint = readTint();
  const rootStyle = (document.documentElement as HTMLElement).style;
  rootStyle.setProperty("--nw-glass-tint", String(tint.glass));
  rootStyle.setProperty("--nw-window-tint", String(tint.frame));
}

// Returns a stop function for hot reload.
export function watchGlassTint(): () => void {
  const observer = { observe: applyTint };
  Services.prefs.addObserver(GLASS_TINT_PREF, observer);
  applyTint();
  return () => {
    Services.prefs.removeObserver(GLASS_TINT_PREF, observer);
    const rootStyle = (document.documentElement as HTMLElement).style;
    rootStyle.removeProperty("--nw-glass-tint");
    rootStyle.removeProperty("--nw-window-tint");
  };
}
