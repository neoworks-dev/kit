// SPDX-License-Identifier: MPL-2.0

// Restyles about:preferences in Kit's style by overriding Firefox's in-content
// design tokens (tokens-shared.css, tokens-brand.css) with @neoworks-dev/ui's
// tokens. light-dark() follows the page's color scheme, which Firefox sets
// from the theme and the website appearance setting.

const STYLE_ID = "kit-preferences-theme";

// Injected before the page's own stylesheets, so the doubled :root outranks
// their token definitions.
const KIT_PREFERENCES_CSS = `
:root:root {
  font-family: "Geist", ui-sans-serif, system-ui, sans-serif;

  --background-color-canvas: light-dark(#f4f4f5, #141416);
  --background-color-box: light-dark(#fff, #1c1c1e);
  --background-color-box-info: light-dark(#f9f9fa, #262628);
  --card-background-color: light-dark(#fff, #1c1c1e);
  --card-border-color: light-dark(#d4d4d8, #29292b);
  --card-border-radius: 12px;
  --card-box-shadow: none;

  --text-color: light-dark(#09090b, #fafafa);
  --text-color-deemphasized: light-dark(#52525b, #a1a1aa);
  --icon-color: light-dark(#52525b, #a1a1aa);
  --link-color: light-dark(#09090b, #fafafa);
  --link-color-hover: light-dark(#3f3f46, #e4e4e7);
  --link-color-active: light-dark(#52525b, #d4d4d8);

  --border-color: light-dark(#d4d4d8, #29292b);
  --border-color-interactive: light-dark(#a1a1aa, #3f3f46);
  --border-color-deemphasized: light-dark(rgba(0, 0, 0, 0.08), rgba(255, 255, 255, 0.06));

  /* Neoworks' primary action is the text color: white on dark, black on
     light. */
  --color-accent-primary: light-dark(#09090b, #fafafa);
  --color-accent-primary-hover: light-dark(#3f3f46, #e4e4e7);
  --color-accent-primary-active: light-dark(#52525b, #d4d4d8);
  --color-accent-primary-selected: light-dark(#09090b, #fafafa);
  --button-background-color-primary: light-dark(#09090b, #fafafa);
  --button-background-color-primary-hover: light-dark(#3f3f46, #e4e4e7);
  --button-background-color-primary-active: light-dark(#52525b, #d4d4d8);
  --button-text-color-primary: light-dark(#fff, #0b0b0d);
  --button-text-color-primary-hover: light-dark(#fff, #0b0b0d);
  --button-text-color-primary-active: light-dark(#fff, #0b0b0d);
  --button-background-color: light-dark(#f4f4f5, #262628);
  --button-background-color-hover: light-dark(#e4e4e7, #2e2e31);
  --button-background-color-active: light-dark(#d4d4d8, #3f3f46);
  --focus-outline-color: light-dark(rgba(9, 9, 11, 0.5), rgba(250, 250, 250, 0.55));

  --border-radius-small: 6px;
  --border-radius-medium: 8px;
  --border-radius-large: 12px;

  --page-nav-button-background-color-hover: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.07));
  --page-nav-button-background-color-active: light-dark(rgba(0, 0, 0, 0.08), rgba(255, 255, 255, 0.1));
  --page-nav-button-background-color-selected: light-dark(#e4e4e7, #2e2e31);
  --page-nav-button-text-color-selected: light-dark(#09090b, #fafafa);
}

/* Floorp's support site isn't Kit's. */
#helpButton {
  display: none !important;
}

kit-key-bindings {
  display: flex;
  flex-direction: column;
}

.kit-key-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color-deemphasized);
}

.kit-key-row:last-child {
  border-bottom: none;
}

.kit-key-sequences {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.kit-key {
  padding: 2px 8px;
  border: 1px solid var(--border-color-interactive);
  border-radius: 6px;
  background: var(--button-background-color);
  color: var(--text-color);
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 0.85em;
  white-space: nowrap;
}
`;

export function injectKitTheme(doc: Document): void {
  if (doc.getElementById(STYLE_ID) || !doc.documentElement) {
    return;
  }
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = KIT_PREFERENCES_CSS;
  doc.documentElement.append(style);
}
