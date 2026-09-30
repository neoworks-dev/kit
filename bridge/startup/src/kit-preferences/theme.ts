// SPDX-License-Identifier: MPL-2.0

// Restyles about:preferences with Kit's dark theme by overriding Firefox's
// in-content design tokens (tokens-shared.css, tokens-brand.css) with the
// @neoworks-dev/ui dark tokens.

const STYLE_ID = "kit-preferences-theme";

// Injected before the page's own stylesheets, so the doubled :root outranks
// their token definitions.
const KIT_PREFERENCES_CSS = `
:root:root {
  color-scheme: dark !important;
  font-family: "Geist", ui-sans-serif, system-ui, sans-serif;

  --background-color-canvas: #141416;
  --background-color-box: #1c1c1e;
  --background-color-box-info: #262628;
  --card-background-color: #1c1c1e;
  --card-border-color: #29292b;
  --card-border-radius: 12px;
  --card-box-shadow: none;

  --text-color: #fafafa;
  --text-color-deemphasized: #a1a1aa;
  --icon-color: #a1a1aa;
  --link-color: #fafafa;
  --link-color-hover: #e4e4e7;
  --link-color-active: #d4d4d8;

  --border-color: #29292b;
  --border-color-interactive: #3f3f46;
  --border-color-deemphasized: rgba(255, 255, 255, 0.06);

  /* Neoworks' primary action is white on dark. */
  --color-accent-primary: #fafafa;
  --color-accent-primary-hover: #e4e4e7;
  --color-accent-primary-active: #d4d4d8;
  --color-accent-primary-selected: #fafafa;
  --button-background-color-primary: #fafafa;
  --button-background-color-primary-hover: #e4e4e7;
  --button-background-color-primary-active: #d4d4d8;
  --button-text-color-primary: #0b0b0d;
  --button-text-color-primary-hover: #0b0b0d;
  --button-text-color-primary-active: #0b0b0d;
  --button-background-color: #262628;
  --button-background-color-hover: #2e2e31;
  --button-background-color-active: #3f3f46;
  --focus-outline-color: rgba(250, 250, 250, 0.55);

  --border-radius-small: 6px;
  --border-radius-medium: 8px;
  --border-radius-large: 12px;

  --page-nav-button-background-color-hover: rgba(255, 255, 255, 0.07);
  --page-nav-button-background-color-active: rgba(255, 255, 255, 0.1);
  --page-nav-button-background-color-selected: #2e2e31;
  --page-nav-button-text-color-selected: #fafafa;
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  border: 1px solid #3f3f46;
  border-radius: 6px;
  background: #262628;
  color: #fafafa;
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
