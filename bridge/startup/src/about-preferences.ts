import { initKitPreferences } from "./kit-preferences/index.ts";

type FloorpIPProtectionDisclosureStrings = Readonly<{
  title: string;
  scope: string;
  fullDisclosure: string;
  settingsPromoHeading: string;
  settingsPromoMessage: string;
}>;

type FloorpIPProtectionDisclosureModule = Readonly<{
  getFloorpIPProtectionDisclosureStrings: () => unknown;
}>;

type IPProtectionSettingItem = Readonly<{
  id?: string;
  l10nId?: string;
  controlAttrs?: Readonly<Record<string, unknown>>;
}>;

type IPProtectionSettingGroupConfig = Readonly<{
  l10nId?: string;
  controlAttrs?: Readonly<Record<string, unknown>>;
  items?: readonly IPProtectionSettingItem[];
}>;

type IPProtectionSettingGroup = HTMLElement & {
  config?: IPProtectionSettingGroupConfig;
  requestUpdate?: () => void;
};

type IPProtectionPromo = HTMLElement & {
  heading?: string;
  message?: string;
};

// In Firefox browser chrome context, document is always available.
// Gecko types declare it as `Document | null`, but it is never null here.
const doc = document!;

// Whether the redesigned settings UI (browser.settings-redesign.enabled)
// is active. Firefox 152 ships it on by default; under the redesign the
// Home pane is rendered with <setting-pane>/<setting-group> elements and
// additionally contains the "startup" and "default browser" groups, which
// are unrelated to Floorp Start and must NOT be hidden.
function isSettingsRedesignEnabled(): boolean {
  try {
    return Services.prefs.getBoolPref(
      "browser.settings-redesign.enabled",
      false,
    );
  } catch {
    return false;
  }
}

// Read the Floorp Start toggle. Returns true when Floorp Start is active
// (i.e. uiCustomization.disableFloorpStart is falsy).
function isFloorpStartEnabled(): boolean {
  try {
    const pref = Services.prefs.getStringPref("floorp.design.configs");
    const config = JSON.parse(pref)?.uiCustomization?.disableFloorpStart;
    return !config;
  } catch {
    // On malformed/missing config, treat Floorp Start as enabled (default).
    return true;
  }
}

// Group ids rendered inside the redesigned paneHome that belong to the
// Floorp Start / Firefox Home surface and therefore should be hidden when
// Floorp Start is active. "startupHome" and "defaultBrowserHome" are
// intentionally excluded — they are generic browser startup settings.
const FLOORP_START_RELATED_GROUP_IDS = ["homepage", "home"] as const;

// CSS class applied to <body> when Floorp Start is active. Matching rules
// in injectFloorpStartHidingStyle() hide the related Home groups via CSS,
// which is robust against Lit re-rendering the <setting-group> elements.
const FLOORP_START_ACTIVE_CLASS = "floorp-start-active";

const FLOORP_START_HIDING_STYLE_ID = "floorp-start-hiding-style";

// Id selectors of the legacy (non-redesign) Home pane sections that are
// specific to the homepage / Firefox Home content.
const FLOORP_START_RELATED_LEGACY_IDS = [
  "#homepageGroup",
  "#homeContentsGroup",
  "#firefoxHomeCategory",
] as const;

function injectFloorpStartHidingStyle(): void {
  if (doc.getElementById(FLOORP_START_HIDING_STYLE_ID)) {
    return;
  }

  const style = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "style",
  );
  style.id = FLOORP_START_HIDING_STYLE_ID;
  style.textContent = `
    /*
     * Hide Floorp Start-related groups inside the redesigned Home pane when
     * the body has the "floorp-start-active" flag (set in JS below). This is
     * CSS-driven so it survives Lit re-renders of <setting-group>, which
     * would otherwise drop the "hidden" attribute we set imperatively.
     * Only the homepage / Firefox Home content groups are hidden; the
     * "startupHome" and "defaultBrowserHome" groups remain available.
     */
    body.${FLOORP_START_ACTIVE_CLASS} setting-pane[data-category="paneHome"] setting-group[groupid="homepage"],
    body.${FLOORP_START_ACTIVE_CLASS} setting-pane[data-category="paneHome"] setting-group[groupid="home"] {
      display: none !important;
    }

    /*
     * Legacy (non-redesign) Home pane: hide the homepage / Firefox Home
     * content sections only.
     */
    body.${FLOORP_START_ACTIVE_CLASS} #homepageGroup,
    body.${FLOORP_START_ACTIVE_CLASS} #homeContentsGroup,
    body.${FLOORP_START_ACTIVE_CLASS} #firefoxHomeCategory {
      display: none !important;
    }
  `;

  const parent =
    doc.head ??
    (doc.querySelector("head") as HTMLElement | null) ??
    doc.documentElement;
  parent?.appendChild(style);
}

function hideFloorpStartLegacyHomePane(): void {
  // Legacy UI: remove only the homepage / Firefox Home content sections as
  // a fallback in case the CSS rule did not apply (e.g. styles not yet
  // injected). The pane itself is shared with nothing else.
  for (const selector of FLOORP_START_RELATED_LEGACY_IDS) {
    doc.querySelector(selector)?.remove();
  }
}

function hideNewTabPage(): void {
  const startEnabled = isFloorpStartEnabled();

  injectFloorpStartHidingStyle();

  // Toggle the body class that drives the CSS hiding rules. This is the
  // primary mechanism and survives Lit re-renders.
  doc.body?.classList.toggle(FLOORP_START_ACTIVE_CLASS, startEnabled);

  if (!startEnabled) {
    return;
  }

  if (isSettingsRedesignEnabled()) {
    // Belt-and-suspenders: also set the hidden attribute on any groups
    // currently present. The MutationObserver keeps this in sync.
    const homePane = doc.querySelector(
      'setting-pane[data-category="paneHome"]',
    );
    if (homePane) {
      for (const groupId of FLOORP_START_RELATED_GROUP_IDS) {
        homePane
          .querySelector(`setting-group[groupid="${groupId}"]`)
          ?.setAttribute("hidden", "true");
      }
    }
  } else {
    hideFloorpStartLegacyHomePane();
  }
}

// Under the redesigned settings UI, the <setting-pane data-category="paneHome">
// element and its child <setting-group>s are created asynchronously after
// DOMContentLoaded, and the legacy "home-pane-loaded" observer notification
// is no longer emitted (gHomePane.init() returns early). Watch the document
// so we re-apply the hidden attribute as a secondary measure whenever the
// pane materializes. CSS (driven by the body class) is the source of truth.
let floorpStartObserver: MutationObserver | null = null;

function startFloorpStartObserver(): void {
  if (floorpStartObserver) return;
  floorpStartObserver = new (doc.defaultView as unknown as {
    MutationObserver: typeof MutationObserver;
  }).MutationObserver(() => {
    if (!isFloorpStartEnabled() || !isSettingsRedesignEnabled()) return;
    const homePane = doc.querySelector(
      'setting-pane[data-category="paneHome"]',
    );
    if (!homePane) return;
    for (const groupId of FLOORP_START_RELATED_GROUP_IDS) {
      const group = homePane.querySelector(
        `setting-group[groupid="${groupId}"]`,
      );
      if (group && !group.hasAttribute("hidden")) {
        group.setAttribute("hidden", "true");
      }
    }
  });
  const target = doc.getElementById("mainPrefPane") ?? doc.body;
  if (target) {
    floorpStartObserver.observe(target, {
      childList: true,
      subtree: true,
    });
  }
}

function initHideNewTabPage(): void {
  const run = (): void => {
    hideNewTabPage();
    startFloorpStartObserver();
  };

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  // Legacy UI relies on this notification; harmless under the redesign.
  try {
    Services.obs.addObserver(hideNewTabPage, "home-pane-loaded");
  } catch (error) {
    console.error("[about-preferences]", "Failed to add home-pane-loaded observer", error);
  }
}

let floorpIPProtectionDisclosure:
  | FloorpIPProtectionDisclosureStrings
  | null
  | undefined;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFloorpIPProtectionDisclosureStrings(
  value: unknown,
): value is FloorpIPProtectionDisclosureStrings {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const strings = value as Readonly<Record<string, unknown>>;
  return isNonEmptyString(strings["title"]) &&
    isNonEmptyString(strings["scope"]) &&
    isNonEmptyString(strings["fullDisclosure"]) &&
    isNonEmptyString(strings["settingsPromoHeading"]) &&
    isNonEmptyString(strings["settingsPromoMessage"]);
}

function isFloorpIPProtectionDisclosureModule(
  value: unknown,
): value is FloorpIPProtectionDisclosureModule {
  return typeof value === "object" && value !== null &&
    typeof (value as Readonly<Record<string, unknown>>)[
        "getFloorpIPProtectionDisclosureStrings"
      ] === "function";
}

function loadFloorpIPProtectionDisclosure():
  | FloorpIPProtectionDisclosureStrings
  | null {
  if (floorpIPProtectionDisclosure !== undefined) {
    return floorpIPProtectionDisclosure;
  }

  try {
    const module = ChromeUtils.importESModule(
      "resource://noraneko/modules/ipprotection/FloorpIPProtectionDisclosure.sys.mjs",
    ) as unknown;
    if (!isFloorpIPProtectionDisclosureModule(module)) {
      throw new Error("IP Protection disclosure module has an invalid export.");
    }

    const disclosure = module.getFloorpIPProtectionDisclosureStrings();
    if (!isFloorpIPProtectionDisclosureStrings(disclosure)) {
      throw new Error(
        "IP Protection disclosure module returned invalid strings.",
      );
    }

    floorpIPProtectionDisclosure = disclosure;
  } catch (error) {
    floorpIPProtectionDisclosure = null;
    console.error(
      "[FloorpIPProtectionPreferences]",
      "Failed to load IP Protection disclosure; skipping preferences adaptation.",
      error,
    );
  }

  return floorpIPProtectionDisclosure;
}

const FLOORP_IP_PROTECTION_READY_ATTRIBUTE = "data-floorp-ipprotection-ready";
const FLOORP_IP_PROTECTION_DISCLOSURE_ID = "floorpIPProtectionDisclosure";

function setElementAttributeIfChanged(
  element: Element,
  name: string,
  value: string,
): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

function ensureFloorpIPProtectionPreferencesStyle(): void {
  const id = "floorp-ipprotection-preferences-style";
  if (doc.getElementById(id)) {
    return;
  }
  const documentElement = doc.documentElement;
  if (!documentElement) {
    return;
  }
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = `
    setting-group[groupid="ipprotection"]:not([${FLOORP_IP_PROTECTION_READY_ATTRIBUTE}="true"]) {
      visibility: hidden !important;
      pointer-events: none !important;
    }

    #${FLOORP_IP_PROTECTION_DISCLOSURE_ID} {
      color: var(--text-color-deemphasized);
      background-color: var(--background-color-box-info);
      border-radius: var(--border-radius-medium);
      margin-block-end: var(--space-medium);
      padding: var(--space-medium);
      line-height: 1.4;
    }
  `;
  documentElement.append(style);
}

function updateFloorpIPProtectionGroupConfig(
  group: IPProtectionSettingGroup,
  disclosure: FloorpIPProtectionDisclosureStrings,
): void {
  const config = group.config;
  if (!config?.items) {
    return;
  }
  const items = config.items;
  const promoItem = items.find(
    (item) => item.id === "ipProtectionNotOptedInSection",
  );
  if (
    config.l10nId === undefined &&
    config.controlAttrs?.label === disclosure.title &&
    promoItem?.l10nId === undefined &&
    promoItem?.controlAttrs?.heading ===
      disclosure.settingsPromoHeading &&
    promoItem.controlAttrs.message ===
      disclosure.settingsPromoMessage
  ) {
    return;
  }
  group.config = {
    ...config,
    l10nId: undefined,
    controlAttrs: {
      ...config.controlAttrs,
      label: disclosure.title,
    },
    items: items.map((item) =>
      item.id === "ipProtectionNotOptedInSection"
        ? {
          ...item,
          l10nId: undefined,
          controlAttrs: {
            ...item.controlAttrs,
            heading: disclosure.settingsPromoHeading,
            message: disclosure.settingsPromoMessage,
          },
        }
        : item
    ),
  };
  group.requestUpdate?.();
}

function ensureOneFloorpIPProtectionPreferences(
  group: IPProtectionSettingGroup,
  disclosure: FloorpIPProtectionDisclosureStrings,
): void {
  group.removeAttribute(FLOORP_IP_PROTECTION_READY_ATTRIBUTE);
  updateFloorpIPProtectionGroupConfig(group, disclosure);

  const fieldset = group.querySelector("moz-fieldset") as
    | (HTMLElement & { label?: string })
    | null;
  const promo = group.querySelector(
    "#setting-control-ipProtectionNotOptedInSection > moz-promo",
  ) as IPProtectionPromo | null;
  const promoControl = group.querySelector(
    "#setting-control-ipProtectionNotOptedInSection",
  );
  if (!fieldset || !promo || !promoControl) {
    return;
  }

  fieldset.removeAttribute("data-l10n-id");
  if (fieldset.label !== disclosure.title) {
    fieldset.label = disclosure.title;
  }
  setElementAttributeIfChanged(
    fieldset,
    "label",
    disclosure.title,
  );

  promo.removeAttribute("data-l10n-id");
  if (
    promo.heading !== disclosure.settingsPromoHeading
  ) {
    promo.heading = disclosure.settingsPromoHeading;
  }
  if (
    promo.message !== disclosure.settingsPromoMessage
  ) {
    promo.message = disclosure.settingsPromoMessage;
  }
  setElementAttributeIfChanged(
    promo,
    "heading",
    disclosure.settingsPromoHeading,
  );
  setElementAttributeIfChanged(
    promo,
    "message",
    disclosure.settingsPromoMessage,
  );

  let disclosureElement = group.querySelector(
    `#${FLOORP_IP_PROTECTION_DISCLOSURE_ID}`,
  );
  if (!disclosureElement) {
    disclosureElement = doc.createElement("div");
    disclosureElement.id = FLOORP_IP_PROTECTION_DISCLOSURE_ID;
    disclosureElement.setAttribute("role", "note");
    promoControl.before(disclosureElement);
  }
  const disclosureText = `${disclosure.scope} ${disclosure.fullDisclosure}`;
  if (disclosureElement.textContent !== disclosureText) {
    disclosureElement.textContent = disclosureText;
  }
  setElementAttributeIfChanged(
    group,
    FLOORP_IP_PROTECTION_READY_ATTRIBUTE,
    "true",
  );
}

function ensureFloorpIPProtectionPreferences(
  disclosure: FloorpIPProtectionDisclosureStrings,
): void {
  ensureFloorpIPProtectionPreferencesStyle();
  const groups = doc.querySelectorAll<IPProtectionSettingGroup>(
    'setting-group[groupid="ipprotection"]',
  );
  for (const group of groups) {
    ensureOneFloorpIPProtectionPreferences(group, disclosure);
  }
}

let floorpIPProtectionPreferencesObserver: MutationObserver | null = null;

function initFloorpIPProtectionPreferences(): void {
  const run = (): void => {
    const disclosure = loadFloorpIPProtectionDisclosure();
    if (!disclosure) {
      return;
    }

    ensureFloorpIPProtectionPreferences(disclosure);
    if (floorpIPProtectionPreferencesObserver) {
      return;
    }
    floorpIPProtectionPreferencesObserver = new (doc.defaultView as unknown as {
      MutationObserver: typeof MutationObserver;
    }).MutationObserver(() => {
      ensureFloorpIPProtectionPreferences(disclosure);
    });
    const target = doc.getElementById("mainPrefPane") ?? doc.body;
    if (target) {
      floorpIPProtectionPreferencesObserver.observe(target, {
        attributes: true,
        attributeFilter: [
          "data-l10n-id",
          "label",
          "heading",
          "message",
        ],
        childList: true,
        subtree: true,
      });
    }
    doc.defaultView?.addEventListener(
      "unload",
      () => {
        floorpIPProtectionPreferencesObserver?.disconnect();
        floorpIPProtectionPreferencesObserver = null;
      },
      { once: true },
    );
  };

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}

initHideNewTabPage();
initFloorpIPProtectionPreferences();
initKitPreferences(doc);
