// SPDX-License-Identifier: MPL-2.0

// The AI agent's helpers file (#53): a small helpers.js in the profile that
// the agent reads and rewrites through MCP tools, browser-use style (it
// writes the helper it's missing). NWAgentBrowser.sys.mts runs a helper in the
// page, in the agent's sandbox, and performs the input actions it returns as
// real clicks and key presses, through the same filter as the `bidi` tool.

export const DEFAULT_HELPERS = `// Kit's browser helpers. Each function runs inside the page, in a sandbox
// apart from the page's own scripts, when you call the \`helper\` tool. Edit
// this file freely with \`helpers_edit\`: add the helper you're missing.
//
// A helper returns data, or input for Kit to perform as a real user would
// (Kit may ask the user first, as with any click or key press):
//   { kit: "click", x, y }            click at viewport CSS pixels
//   { kit: "type", text }             type into the focused element
//   { kit: "key", key }               Enter, Tab, Escape, Backspace, Delete, Space,
//                                     ArrowUp/Down/Left/Right, PageUp/Down, Home, End
//   { kit: "scroll", x, y, dx, dy }   scroll by dx/dy pixels at a point
// or an array of them, performed in order.

// The visible elements you can act on, numbered. The numbers stay valid
// until the next snapshot.
function snapshot(limit = 200) {
  const selector = [
    "a[href]", "button", "input", "textarea", "select", "summary",
    "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]", "[role=tab]",
    "[role=menuitem]", "[role=option]", "[role=combobox]", "[role=textbox]",
    "[contenteditable=''], [contenteditable=true]",
  ].join(", ");
  const elements = [];
  const lines = [];
  let below = 0;
  for (const el of document.querySelectorAll(selector)) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden") {
      continue;
    }
    if (rect.top > innerHeight) {
      below++;
      continue;
    }
    if (rect.bottom < 0 || elements.length >= limit) {
      continue;
    }
    const index = elements.push(el) - 1;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || (tag === "input" ? "input[" + el.type + "]" : tag);
    const value = el.type === "password" ? "" : (el.value ?? "");
    const label = (el.getAttribute("aria-label") || el.innerText || el.placeholder ||
      el.title || el.getAttribute("alt") || "").trim().replace(/\\s+/g, " ").slice(0, 80);
    lines.push("[" + index + "] " + role + " " + JSON.stringify(label) +
      (value && tag !== "button" ? " value=" + JSON.stringify(String(value).slice(0, 80)) : ""));
  }
  globalThis.kitElements = elements;
  return [
    document.title,
    location.href,
    ...lines,
    below ? "(" + below + " more below: scroll to see them)" : "",
  ].filter(Boolean).join("\\n");
}

// The text of the page, or of the first element matching \`selector\`, from
// \`offset\` on: for reading articles, comments and results.
function read(selector = "", offset = 0, length = 20000) {
  const root = selector ? document.querySelector(selector) : document.querySelector("main, [role=main], article") ?? document.body;
  if (!root) {
    throw new Error("Nothing matches " + selector);
  }
  const text = root.innerText.replace(/\\n{3,}/g, "\\n\\n").trim();
  const part = text.slice(offset, offset + length);
  return offset + part.length < text.length
    ? part + "\\n(" + (text.length - offset - part.length) + " more characters: read(" +
      JSON.stringify(selector) + ", " + (offset + part.length) + "))"
    : part;
}

// The middle of element \`index\` from the last snapshot, scrolled into view.
function center(index) {
  const el = globalThis.kitElements?.[index];
  if (!el || !el.isConnected) {
    throw new Error("No element " + index + ": take a new snapshot");
  }
  el.scrollIntoView({ block: "center", inline: "center" });
  const rect = el.getBoundingClientRect();
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
}

function click(index) {
  return { kit: "click", ...center(index) };
}

// Clicks the field first, then types.
function type(index, text) {
  return [click(index), { kit: "type", text }];
}

function press(key) {
  return { kit: "key", key };
}
`;

// Input a helper can hand back to Kit.
export type HelperAction =
  | { kit: "click"; x: number; y: number }
  | { kit: "type"; text: string }
  | { kit: "key"; key: string }
  | { kit: "scroll"; x: number; y: number; dx: number; dy: number };

// WebDriver's codes for the named keys.
const KEYS: Record<string, string> = {
  Enter: "\uE007",
  Tab: "\uE004",
  Escape: "\uE00C",
  Backspace: "\uE003",
  Delete: "\uE017",
  Space: " ",
  ArrowUp: "\uE013",
  ArrowDown: "\uE015",
  ArrowLeft: "\uE012",
  ArrowRight: "\uE014",
  PageUp: "\uE00E",
  PageDown: "\uE00F",
  Home: "\uE011",
  End: "\uE010",
};

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function isHelperName(name: string): boolean {
  return IDENTIFIER.test(name);
}

// The function script.callFunction runs: the helpers, then a call to one of
// them. Arguments come in as JSON and the result goes back as JSON.
export function helperCall(source: string, name: string): string {
  return `async function (kitArgs) {\n${source}\n;\nreturn JSON.stringify((await ${name}(...JSON.parse(kitArgs))) ?? null);\n}`;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isAction(value: unknown): value is HelperAction {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const action = value as Record<string, unknown>;
  switch (action.kit) {
    case "click":
      return isNumber(action.x) && isNumber(action.y);
    case "type":
      return typeof action.text === "string";
    case "key":
      return typeof action.key === "string" && action.key in KEYS;
    case "scroll":
      return isNumber(action.x) && isNumber(action.y) && isNumber(action.dx) && isNumber(action.dy);
    default:
      return false;
  }
}

// The actions in a helper's result, or null when it returned plain data.
export function helperActions(result: unknown): HelperAction[] | null {
  const list = Array.isArray(result) ? result : [result];
  return list.length > 0 && list.every(isAction) ? list : null;
}

// One action as input.performActions sources.
export function inputSources(action: HelperAction): object[] {
  switch (action.kit) {
    case "click":
      return [{
        type: "pointer",
        id: "kit-mouse",
        parameters: { pointerType: "mouse" },
        actions: [
          { type: "pointerMove", x: Math.round(action.x), y: Math.round(action.y) },
          { type: "pointerDown", button: 0 },
          { type: "pointerUp", button: 0 },
        ],
      }];
    case "type":
      return [{
        type: "key",
        id: "kit-keyboard",
        actions: Array.from(action.text).flatMap((character) => [
          { type: "keyDown", value: character },
          { type: "keyUp", value: character },
        ]),
      }];
    case "key":
      return [{
        type: "key",
        id: "kit-keyboard",
        actions: [
          { type: "keyDown", value: KEYS[action.key] },
          { type: "keyUp", value: KEYS[action.key] },
        ],
      }];
    case "scroll":
      return [{
        type: "wheel",
        id: "kit-wheel",
        actions: [{
          type: "scroll",
          x: Math.round(action.x),
          y: Math.round(action.y),
          deltaX: Math.round(action.dx),
          deltaY: Math.round(action.dy),
        }],
      }];
  }
}

export function describeAction(action: HelperAction): string {
  switch (action.kit) {
    case "click":
      return `clicked at ${Math.round(action.x)},${Math.round(action.y)}`;
    case "type":
      return `typed ${JSON.stringify(action.text)}`;
    case "key":
      return `pressed ${action.key}`;
    case "scroll":
      return `scrolled by ${Math.round(action.dx)},${Math.round(action.dy)}`;
  }
}
