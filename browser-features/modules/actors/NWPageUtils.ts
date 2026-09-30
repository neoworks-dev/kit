/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// DOM helpers for Kit's key handling in web content (NWKeysChild).

type EditableElement = Element & {
  isContentEditable?: boolean;
};

export function isEditableTarget(
  target: EventTarget | null,
  designMode: string | null | undefined,
): boolean {
  if (designMode?.toLowerCase() === "on") {
    return true;
  }

  const element = target as EditableElement | null;
  const localName = element?.localName?.toLowerCase() ?? "";
  if (localName === "input" || localName === "textarea") {
    return true;
  }
  if (element?.isContentEditable === true) {
    return true;
  }

  let current: Element | null = element;
  while (current) {
    const value = current.getAttribute?.("contenteditable");
    if (value !== null && value !== undefined) {
      return value.toLowerCase() !== "false";
    }
    current = current.parentElement;
  }
  return false;
}

// Whether the event happened in something the user types into, looking
// through shadow roots via the composed path.
export function isEditableEvent(event: Event, doc: Document): boolean {
  const path = event.composedPath?.() ?? [];
  for (const target of path) {
    if (isEditableTarget(target, doc.designMode)) {
      return true;
    }
  }
  return isEditableTarget(doc.activeElement, doc.designMode);
}

// The closest scrollable ancestor of the focused element, else the document.
export function findScrollableElement(
  win: Window,
  horizontal: boolean,
): Element | null {
  const doc = win.document;
  let el: Element | null = doc.activeElement || doc.body;
  if (!el) return doc.scrollingElement || doc.documentElement;

  while (el && el !== doc.documentElement) {
    const style = win.getComputedStyle(el);
    const overflow = horizontal ? style?.overflowX : style?.overflowY;
    const overflows = horizontal
      ? el.scrollWidth > el.clientWidth
      : el.scrollHeight > el.clientHeight;
    if ((overflow === "auto" || overflow === "scroll") && overflows) {
      return el;
    }
    el = el.parentElement;
  }

  return doc.scrollingElement || doc.documentElement;
}
