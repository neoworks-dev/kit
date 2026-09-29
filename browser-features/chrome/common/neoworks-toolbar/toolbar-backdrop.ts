// SPDX-License-Identifier: MPL-2.0

// Glass top bar. The bar sits above the page, not over it, so there is nothing
// behind it to blur. It shows the page's top edge mirrored upward instead;
// toolbar.css blurs it and lays the glass tint on top, so page colors bleed
// into the bar.

import { OUTSIDE_PAGE_COLOR, selectedBrowser } from "../neoworks-ui/page-backdrop.ts";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";

const CANVAS_ID = "neoworks-toolbar-backdrop";
const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
// Page strip below the bar that gets mirrored, in page CSS pixels.
const STRIP_HEIGHT_PX = 48;
// The strip ends up blurred beyond recognition, so a low-res snapshot will do.
const SNAPSHOT_SCALE = 0.25;
// The bar is always visible, so repaint on a slow timer instead of every
// frame like the on-demand glass panels.
const REFRESH_INTERVAL_MS = 400;

function drawMirrored(canvas: HTMLCanvasElement, bitmap: ImageBitmap): void {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  // Flip vertically so the page's top edge meets the bar's bottom edge.
  context.setTransform(1, 0, 0, -1, 0, bitmap.height);
  context.drawImage(bitmap, 0, 0);
}

async function paintToolbarBackdrop(canvas: HTMLCanvasElement): Promise<void> {
  const browser = selectedBrowser();
  const windowGlobal = browser.browsingContext?.currentWindowGlobal;
  if (!windowGlobal) {
    return;
  }
  const zoom = browser.fullZoom;
  const pageWidth = browser.getBoundingClientRect().width / zoom;
  const strip = new DOMRect(0, 0, pageWidth, STRIP_HEIGHT_PX);
  const bitmap = await windowGlobal.drawSnapshot(strip, SNAPSHOT_SCALE * zoom, OUTSIDE_PAGE_COLOR);
  drawMirrored(canvas, bitmap);
  bitmap.close();
}

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElementNS(XHTML_NAMESPACE, "canvas") as HTMLCanvasElement;
  canvas.id = CANVAS_ID;
  return canvas;
}

// Returns a stop function for hot reload.
export function startToolbarBackdrop(): () => void {
  const toolbox = document.getElementById("navigator-toolbox");
  if (!toolbox) {
    console.error("[neoworks-toolbar] #navigator-toolbox is missing.");
    return () => {};
  }
  const canvas = createCanvas();
  toolbox.prepend(canvas);

  let painting = false;
  const repaint = () => {
    if (painting || document.hidden) {
      return;
    }
    painting = true;
    paintToolbarBackdrop(canvas)
      .catch((error) => console.error("[neoworks-toolbar] Backdrop snapshot failed:", error))
      .finally(() => {
        painting = false;
      });
  };

  const tabContainer = tabbrowser().tabContainer;
  const timer = setInterval(repaint, REFRESH_INTERVAL_MS);
  tabContainer.addEventListener("TabSelect", repaint);
  repaint();

  return () => {
    clearInterval(timer);
    tabContainer.removeEventListener("TabSelect", repaint);
    canvas.remove();
  };
}
