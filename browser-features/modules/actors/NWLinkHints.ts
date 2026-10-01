// SPDX-License-Identifier: MPL-2.0

// Vim-style link hints: label every clickable element in the viewport, then
// activate the one whose label the user types. The labels follow their
// elements while the page scrolls.

const HINT_CHARACTERS = "asdfghjkl";
const CLICKABLE_SELECTOR =
  "a, button, input, textarea, select, summary, [role=button], [role=link], [onclick], [tabindex]";

const CONTAINER_STYLE =
  "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;";
const BADGE_STYLE =
  "all: initial; position: fixed; background: #fbbf24; color: #1a1a1a; font: bold 11px monospace; padding: 1px 4px; border-radius: 4px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);";

// Distinct labels drawn from the home row, shortest first. Labels are
// expanded into longer ones only as needed, and an expanded label is dropped,
// so none is the start of another.
export function hintLabels(count: number): string[] {
  const characters = HINT_CHARACTERS.split("");
  const labels = [""];
  let expanded = 0;
  // The empty root label always expands.
  while (expanded === 0 || labels.length - expanded < count) {
    const prefix = labels[expanded++];
    labels.push(...characters.map((character) => prefix + character));
  }
  return labels.slice(expanded, expanded + count);
}

function isClickable(element: HTMLElement): boolean {
  const tagName = element.localName;
  if (tagName === "a") {
    return element.hasAttribute("href");
  }
  if (tagName === "input") {
    return (element as HTMLInputElement).type !== "hidden";
  }
  if (["button", "textarea", "select", "summary"].includes(tagName)) {
    return true;
  }
  const role = element.getAttribute("role");
  if (role === "button" || role === "link" || element.hasAttribute("onclick")) {
    return true;
  }
  return element.tabIndex >= 0;
}

function isInViewport(rect: DOMRect, win: Window): boolean {
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  return rect.bottom > 0 && rect.right > 0 && rect.top < win.innerHeight &&
    rect.left < win.innerWidth;
}

// Inside a link or button, the outer element already gets the hint.
function isInsideLinkOrButton(element: HTMLElement): boolean {
  return !!element.parentElement?.closest("a[href], button");
}

function findHintTargets(win: Window): HTMLElement[] {
  const elements = Array.from(
    win.document.querySelectorAll<HTMLElement>(CLICKABLE_SELECTOR),
  );
  return elements.filter((element) =>
    isClickable(element) &&
    !isInsideLinkOrButton(element) &&
    isInViewport(element.getBoundingClientRect(), win) &&
    element.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })
  );
}

function linkUrl(element: HTMLElement): string | null {
  if (element.localName !== "a") {
    return null;
  }
  const url = (element as HTMLAnchorElement).href;
  if (!url) {
    return null;
  }
  return url;
}

// The `hidden` attribute loses to the badge's `all: initial` inline style.
function setBadgeVisible(badge: HTMLElement, visible: boolean): void {
  if (visible) {
    badge.style.removeProperty("display");
    return;
  }
  badge.style.display = "none";
}

interface HintBadge {
  label: string;
  element: HTMLElement;
  badge: HTMLElement;
}

export interface LinkHintOptions {
  background: boolean;
  openInBackground: (url: string) => void;
  onFinish: () => void;
}

export class NWLinkHintSession {
  private readonly container: HTMLElement;
  private readonly badges: HintBadge[];
  private typedLabel = "";
  private repositionFrame = 0;
  private readonly onViewportChange = () => this.scheduleReposition();

  constructor(private readonly win: Window, private readonly options: LinkHintOptions) {
    const document = win.document;
    this.container = document.createElement("div");
    this.container.setAttribute("data-neoworks-hints", "");
    this.container.style.cssText = CONTAINER_STYLE;

    const targets = findHintTargets(win);
    const labels = hintLabels(targets.length);
    this.badges = targets.map((element, index) => this.createBadge(element, labels[index]));
    document.documentElement?.appendChild(this.container);

    if (this.badges.length === 0) {
      this.destroy();
      return;
    }
    // Capture: scrolling any inner scroller moves its elements too.
    win.addEventListener("scroll", this.onViewportChange, { capture: true, passive: true });
    win.addEventListener("resize", this.onViewportChange);
  }

  isActive(): boolean {
    return this.container.isConnected;
  }

  handleKey(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Escape") {
      this.destroy();
      return;
    }
    if (event.key === "Backspace") {
      this.typedLabel = this.typedLabel.slice(0, -1);
      this.updateVisibleBadges();
      return;
    }
    if (!/^[a-z]$/i.test(event.key)) {
      return;
    }
    this.typedLabel += event.key.toLowerCase();
    this.updateVisibleBadges();
  }

  destroy(): void {
    this.win.removeEventListener("scroll", this.onViewportChange, { capture: true });
    this.win.removeEventListener("resize", this.onViewportChange);
    this.win.cancelAnimationFrame(this.repositionFrame);
    this.container.remove();
    this.options.onFinish();
  }

  private createBadge(element: HTMLElement, label: string): HintBadge {
    const badge = this.win.document.createElement("div");
    badge.textContent = label;
    badge.style.cssText = BADGE_STYLE;
    this.container.appendChild(badge);
    const entry = { label, element, badge };
    this.placeBadge(entry);
    return entry;
  }

  // Pins the badge to its element's corner; hidden while the element is
  // scrolled out of view or doesn't match what was typed.
  private placeBadge(entry: HintBadge): void {
    const rect = entry.element.getBoundingClientRect();
    entry.badge.style.left = `${Math.max(0, rect.left)}px`;
    entry.badge.style.top = `${Math.max(0, rect.top)}px`;
    setBadgeVisible(
      entry.badge,
      entry.label.startsWith(this.typedLabel) && isInViewport(rect, this.win),
    );
  }

  private scheduleReposition(): void {
    if (this.repositionFrame) {
      return;
    }
    this.repositionFrame = this.win.requestAnimationFrame(() => {
      this.repositionFrame = 0;
      for (const entry of this.badges) {
        this.placeBadge(entry);
      }
    });
  }

  private updateVisibleBadges(): void {
    const remaining = this.badges.filter((entry) => entry.label.startsWith(this.typedLabel));
    for (const entry of this.badges) {
      this.placeBadge(entry);
    }
    if (remaining.length === 0) {
      this.destroy();
      return;
    }
    if (remaining.length === 1 && remaining[0].label === this.typedLabel) {
      this.activate(remaining[0].element);
    }
  }

  private activate(element: HTMLElement): void {
    this.destroy();
    const url = linkUrl(element);
    if (this.options.background && url) {
      this.options.openInBackground(url);
      return;
    }
    element.focus();
    element.click();
  }
}
