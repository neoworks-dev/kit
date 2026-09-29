// SPDX-License-Identifier: MPL-2.0

// Mirrors NWSpotlightChild for key events handled by the browser chrome itself
// (sidebar, toolbars). Keys aimed at web content are handled by the actor.

const DOUBLE_SPACE_WINDOW_MS = 400;
const EDITABLE_TAGS = new Set(["input", "textarea", "select"]);

function isPlainSpace(event: KeyboardEvent): boolean {
  if (event.key !== " " || event.repeat || event.isComposing) {
    return false;
  }
  return !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}

function isEditableElement(element: Element): boolean {
  if (EDITABLE_TAGS.has(element.localName)) {
    return true;
  }
  return (element as HTMLElement).isContentEditable === true;
}

function isTypingTarget(event: KeyboardEvent): boolean {
  for (const target of event.composedPath()) {
    if (target instanceof Element && isEditableElement(target)) {
      return true;
    }
  }
  return false;
}

// Remote <browser> elements forward keys to content, where the actor decides.
function targetsWebContent(event: KeyboardEvent): boolean {
  const target = event.target as Element | null;
  return target?.localName === "browser";
}

export function listenForChromeDoubleSpace(onDoubleSpace: () => void): () => void {
  let lastSpaceTime = 0;

  function handleKeyDown(event: KeyboardEvent): void {
    if (!isPlainSpace(event) || isTypingTarget(event) || targetsWebContent(event)) {
      lastSpaceTime = 0;
      return;
    }
    const now = Date.now();
    if (now - lastSpaceTime > DOUBLE_SPACE_WINDOW_MS) {
      lastSpaceTime = now;
      return;
    }
    lastSpaceTime = 0;
    event.preventDefault();
    event.stopPropagation();
    onDoubleSpace();
  }

  addEventListener("keydown", handleKeyDown, true);
  return () => removeEventListener("keydown", handleKeyDown, true);
}
