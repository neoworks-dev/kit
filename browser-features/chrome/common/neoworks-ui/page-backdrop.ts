// SPDX-License-Identifier: MPL-2.0

// Glass over web content. backdrop-filter in the chrome can't sample the page
// (it renders in the content process), so glass panels draw a snapshot of the
// page region behind them into a canvas that CSS blurs (.nw-glass-backdrop).

// Extra page area captured around the panel so the blur has real pixels to
// sample at the edges instead of fading to transparent (a pale fringe on
// bright pages). Must exceed the blur's reach: 3 × the 28px radius in
// glass.css (.nw-glass-backdrop).
const BLUR_MARGIN_PX = 96;
// The window frame's color (it follows the theme, neoworks-ui/frame.css);
// fills parts of the margin that lie outside the page.
function outsidePageColor(): string {
  const root = document.documentElement;
  return (root && getComputedStyle(root)?.backgroundColor) || "transparent";
}

interface SnapshotWindowGlobal {
  drawSnapshot(rect: DOMRect, scale: number, backgroundColor: string): Promise<ImageBitmap>;
}

interface SnapshotBrowser extends Element {
  fullZoom: number;
  browsingContext: { currentWindowGlobal: SnapshotWindowGlobal | null } | null;
}

function selectedBrowser(): SnapshotBrowser {
  return (gBrowser as unknown as { selectedBrowser: SnapshotBrowser }).selectedBrowser;
}

// Where the panel sits when shown: its box without CSS transforms, so a
// sidebar still sliding in captures its final position.
function restingRect(panel: HTMLElement): DOMRect {
  const rect = panel.getBoundingClientRect();
  const style = getComputedStyle(panel);
  if (!style) {
    return rect;
  }
  const transform = new DOMMatrix(style.transform);
  return new DOMRect(rect.left - transform.m41, rect.top - transform.m42, rect.width, rect.height);
}

function expand(rect: DOMRect, margin: number): DOMRect {
  return new DOMRect(rect.left - margin, rect.top - margin, rect.width + 2 * margin, rect.height + 2 * margin);
}

function intersect(first: DOMRect, second: DOMRect): DOMRect | null {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.min(first.right, second.right);
  const bottom = Math.min(first.bottom, second.bottom);
  if (right <= left || bottom <= top) {
    return null;
  }
  return new DOMRect(left, top, right - left, bottom - top);
}

// The page region in the page's own CSS pixels, which differ from chrome
// pixels when the page is zoomed.
function pageRegion(visible: DOMRect, browserRect: DOMRect, zoom: number): DOMRect {
  return new DOMRect(
    (visible.left - browserRect.left) / zoom,
    (visible.top - browserRect.top) / zoom,
    visible.width / zoom,
    visible.height / zoom,
  );
}

function placeCanvas(canvas: HTMLCanvasElement, panel: HTMLElement, area: DOMRect): void {
  const panelRect = restingRect(panel);
  // Absolute children are positioned from the padding box, inside the border.
  canvas.style.left = `${area.left - panelRect.left - panel.clientLeft}px`;
  canvas.style.top = `${area.top - panelRect.top - panel.clientTop}px`;
  canvas.style.width = `${area.width}px`;
  canvas.style.height = `${area.height}px`;
}

async function paintBackdrop(panel: HTMLElement, canvas: HTMLCanvasElement): Promise<void> {
  const area = expand(restingRect(panel), BLUR_MARGIN_PX);
  const browser = selectedBrowser();
  const browserRect = browser.getBoundingClientRect();
  const visible = intersect(area, browserRect);
  const windowGlobal = browser.browsingContext?.currentWindowGlobal;
  if (!visible || !windowGlobal) {
    return;
  }
  const pixelRatio = window.devicePixelRatio;
  const zoom = browser.fullZoom;
  const outsideColor = outsidePageColor();
  const bitmap = await windowGlobal.drawSnapshot(
    pageRegion(visible, browserRect, zoom),
    pixelRatio * zoom,
    outsideColor,
  );
  drawBitmap(canvas, bitmap, area, visible, pixelRatio, outsideColor);
  bitmap.close();
  placeCanvas(canvas, panel, area);
}

function drawBitmap(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  area: DOMRect,
  visible: DOMRect,
  pixelRatio: number,
  outsideColor: string,
): void {
  canvas.width = Math.round(area.width * pixelRatio);
  canvas.height = Math.round(area.height * pixelRatio);
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.fillStyle = outsideColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    bitmap,
    (visible.left - area.left) * pixelRatio,
    (visible.top - area.top) * pixelRatio,
    visible.width * pixelRatio,
    visible.height * pixelRatio,
  );
}

export interface PageBackdrop {
  start(): void;
  stop(): void;
}

// Repaints the backdrop of the panel with `panelId` while started, so it
// follows scrolling, tab switches and animations: each snapshot starts on the
// next frame after the previous one landed. Elements are looked up by id
// because solid-xul has no refs.
export function createPageBackdrop(panelId: string, canvasId: string): PageBackdrop {
  let running = false;
  let frameRequest: number | undefined;

  async function refresh(): Promise<void> {
    const panel = document.getElementById(panelId);
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!panel || !canvas) {
      return;
    }
    try {
      await paintBackdrop(panel, canvas);
    } catch (error) {
      console.error("[neoworks-ui] Page backdrop snapshot failed:", error);
    }
  }

  function scheduleNextFrame(): void {
    if (!running) {
      return;
    }
    frameRequest = requestAnimationFrame(() => {
      refresh().then(scheduleNextFrame);
    });
  }

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      scheduleNextFrame();
    },
    stop() {
      running = false;
      if (frameRequest !== undefined) {
        cancelAnimationFrame(frameRequest);
        frameRequest = undefined;
      }
    },
  };
}
