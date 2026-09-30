// SPDX-License-Identifier: MPL-2.0

// Solid renderer that builds the DOM with createElement. Solid's default DOM
// output clones <template> HTML, and on a system-principal page (about:newtab)
// Firefox sanitizes that HTML and drops form controls such as <button>.
// vite.config.ts compiles JSX against this module (generate: "universal").

import { createRenderer } from "solid-js/universal";

// Set as DOM properties so they reflect live state, not the initial attribute.
const PROPERTIES = new Set(["value", "checked", "disabled", "selected"]);

type Listener = (event: Event) => void;
const listeners = new WeakMap<Element, Map<string, Listener>>();

function setListener(node: Element, type: string, listener: unknown): void {
  let map = listeners.get(node);
  if (!map) {
    map = new Map();
    listeners.set(node, map);
  }
  const prev = map.get(type);
  if (prev) node.removeEventListener(type, prev);
  if (typeof listener === "function") {
    node.addEventListener(type, listener as Listener);
    map.set(type, listener as Listener);
  } else {
    map.delete(type);
  }
}

function setStyle(node: HTMLElement, value: unknown, prev: unknown): void {
  if (typeof value === "string" || value == null) {
    node.style.cssText = value ?? "";
    return;
  }
  const next = value as Record<string, string | undefined>;
  if (prev && typeof prev === "object") {
    for (const name of Object.keys(prev)) {
      if (!(name in next)) node.style.removeProperty(name);
    }
  }
  for (const [name, v] of Object.entries(next)) {
    if (v == null) node.style.removeProperty(name);
    else node.style.setProperty(name, v);
  }
}

function setProperty(
  node: Element,
  name: string,
  value: unknown,
  prev: unknown,
): void {
  if (name.startsWith("on") && name.length > 2) {
    setListener(node, name.slice(2).toLowerCase(), value);
  } else if (name === "class") {
    node.setAttribute("class", typeof value === "string" ? value : "");
  } else if (name === "classList") {
    for (const [cls, on] of Object.entries(value as Record<string, boolean>)) {
      node.classList.toggle(cls, !!on);
    }
  } else if (name === "style") {
    setStyle(node as HTMLElement, value, prev);
  } else if (PROPERTIES.has(name)) {
    (node as unknown as Record<string, unknown>)[name] = value;
  } else if (value == null || value === false && !name.startsWith("aria-")) {
    node.removeAttribute(name);
  } else if (value === true && !name.startsWith("aria-")) {
    node.setAttribute(name, "");
  } else {
    node.setAttribute(name, String(value));
  }
}

export const {
  render,
  effect,
  memo,
  createComponent,
  createElement,
  createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
  use,
} = createRenderer<Node>({
  createElement: (tag) => document.createElement(tag),
  createTextNode: (value) => document.createTextNode(value),
  replaceText: (node, value) => {
    (node as Text).data = value;
  },
  isTextNode: (node) => node.nodeType === Node.TEXT_NODE,
  setProperty: (node, name, value, prev) =>
    setProperty(node as Element, name, value, prev),
  insertNode: (parent, node, anchor) => {
    parent.insertBefore(node, anchor ?? null);
  },
  removeNode: (parent, node) => {
    parent.removeChild(node);
  },
  getParentNode: (node) => node.parentNode ?? undefined,
  getFirstChild: (node) => node.firstChild ?? undefined,
  getNextSibling: (node) => node.nextSibling ?? undefined,
});
