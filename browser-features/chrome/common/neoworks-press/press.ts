// SPDX-License-Identifier: MPL-2.0

// Buttons sink a little while held and spring back on release.
//
// Driven from script on the `scale` property rather than a CSS transition:
// the sidebar's rules set their own `transition` lists, which would replace
// a shared one, and `scale` composes with any `transform` already set.

const PRESSABLE = [
  "toolbarbutton",
  "button",
  ".nw-tab",
  ".nw-essential-tile",
  ".nw-group-header",
  ".nw-recently-closed-header",
  ".nw-container-option",
  ".nw-media",
].join(", ");

// Every control sinks by about the same few pixels: a 28px button to 92%, a
// full-width tab row to ~96%.
const SINK_PX = 8;
const MAX_SINK = 0.08;
const PRESS_MS = 100;
const RELEASE_MS = 300;
// Overshoots past 1 before settling.
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

const reducedMotion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
const animations = new WeakMap<Element, Animation>();
let pressed: Element | null = null;

function pressableFrom(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const element = target.closest(PRESSABLE);
  if (!element || element.matches("[disabled], :disabled")) {
    return null;
  }
  return element;
}

function pressedScale(element: Element): number {
  const { width, height } = element.getBoundingClientRect();
  const size = Math.max(width, height);
  if (size === 0) {
    return 1;
  }
  return 1 - Math.min(MAX_SINK, SINK_PX / size);
}

// Starts from where a running animation has it, so a quick double click
// doesn't jump.
function animateScale(
  element: Element,
  to: number,
  options: KeyframeAnimationOptions,
): void {
  const from = getComputedStyle(element)?.scale ?? "none";
  animations.get(element)?.cancel();
  const animation = element.animate(
    { scale: [from === "none" ? "1" : from, String(to)] },
    options,
  );
  animations.set(element, animation);
}

function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !event.isPrimary || reducedMotion?.matches) {
    return;
  }
  const element = pressableFrom(event.target);
  if (!element) {
    return;
  }
  release();
  pressed = element;
  animateScale(element, pressedScale(element), {
    duration: PRESS_MS,
    easing: "ease-out",
    fill: "forwards",
  });
}

function release(): void {
  if (!pressed) {
    return;
  }
  const element = pressed;
  pressed = null;
  animateScale(element, 1, { duration: RELEASE_MS, easing: SPRING });
}

// Menus grab the pointer when they open, and a drag swallows the pointerup.
const RELEASE_EVENTS = [
  "pointerup",
  "pointercancel",
  "dragstart",
  "popupshowing",
];

// Returns a stop function for hot reload.
export function watchPresses(): () => void {
  globalThis.addEventListener("pointerdown", handlePointerDown, true);
  for (const eventName of RELEASE_EVENTS) {
    globalThis.addEventListener(eventName, release, true);
  }
  // Not captured: elements' blur would arrive too, and pressing a button
  // moves focus.
  globalThis.addEventListener("blur", release);
  return () => {
    globalThis.removeEventListener("pointerdown", handlePointerDown, true);
    for (const eventName of RELEASE_EVENTS) {
      globalThis.removeEventListener(eventName, release, true);
    }
    globalThis.removeEventListener("blur", release);
    release();
  };
}
