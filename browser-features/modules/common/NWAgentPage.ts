// SPDX-License-Identifier: MPL-2.0

// What the AI agent's filter (NWAgentBrowser.sys.mts) looks at on a page
// before a script or input command goes through: the live values of password
// and card fields, and what a click or key press would hit.
//
// The inspector runs through BiDi's script.callFunction in its own sandbox,
// apart from the agent's, and returns its report as a JSON string.

// A control a click or key press would reach.
export interface PageTarget {
  label: string;
  // Looks like buy / pay / order / subscribe / delete.
  risky: boolean;
  // Sits in a form with card fields.
  checkout: boolean;
}

export interface PageReport {
  // Non-empty values of password and card fields, to redact.
  secrets: string[];
  // One entry per point, then one per element, in the order given.
  targets: (PageTarget | null)[];
  // The focused element, where key presses go.
  focus: PageTarget | null;
}

// A viewport point the agent's pointer presses at.
export interface PagePoint {
  x: number;
  y: number;
}

export const INSPECTOR_SANDBOX = "kit-filter";

// Arguments: points (PagePoint[]), then any number of elements.
export const INSPECT_PAGE = `function (points, ...elements) {
  const RISKY = /\\b(buy|pay|purchase|order|checkout|check out|subscribe|delete|kaufen|bezahlen|bestellen|abonnieren|löschen)\\b/i;
  const CARD_NAME = /card.?(num|number)|cc.?(num|number|exp|csc)|cvc|cvv|csc|security.?code/i;
  const isCard = (el) =>
    /^cc-/.test(el.getAttribute("autocomplete") || "") ||
    CARD_NAME.test((el.getAttribute("name") || "") + " " + (el.id || ""));
  const isSecret = (el) => el.type === "password" || isCard(el);

  const fields = Array.from(document.querySelectorAll("input, textarea, select"));
  const secrets = fields
    .filter(isSecret)
    .map((el) => el.value)
    .filter((value) => typeof value === "string" && value.length >= 3);

  const describe = (el) => {
    if (!el || el.nodeType !== 1) {
      return null;
    }
    const control = el.closest(
      "button, a, [role=button], [role=menuitem], [role=link], summary, " +
        "input[type=submit], input[type=button], input[type=image]",
    ) || el;
    const label = (
      control.getAttribute("aria-label") ||
      (control.tagName === "INPUT" ? control.value : "") ||
      control.innerText ||
      control.getAttribute("title") ||
      control.getAttribute("alt") ||
      ""
    ).trim().replace(/\\s+/g, " ").slice(0, 80);
    const form = control.closest("form");
    const checkout = isCard(control) ||
      !!(form && Array.from(form.elements).some((field) => isCard(field)));
    const submits = control.type === "submit" || control.tagName === "BUTTON";
    return { label, risky: RISKY.test(label) || (checkout && submits), checkout };
  };

  return JSON.stringify({
    secrets,
    targets: [
      ...points.map((point) => describe(document.elementFromPoint(point.x, point.y))),
      ...elements.map(describe),
    ],
    focus: describe(document.activeElement === document.body ? null : document.activeElement),
  });
}`;
