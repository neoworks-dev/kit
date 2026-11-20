// SPDX-License-Identifier: MPL-2.0

// Swaps Firefox's fox illustrations in the runtime for Neoworks' marmot. The
// marmot poses (marmot/*.webp, from neoworks.dev's apps/web/static/marmot) are
// bitmaps, so each fox SVG is replaced by an SVG that embeds one as a data:
// URI, keeping the original's size and viewBox so the pages that show it lay
// out as before. MISSING-IMAGES.md lists the foxes that still need a pose.

import * as path from "@std/path";
import { encodeBase64 } from "@std/encoding/base64";
import { exists } from "../../../tools/src/utils.ts";

const MARMOT_DIR = path.join(
  path.dirname(path.fromFileUrl(import.meta.url)),
  "marmot",
);

const TOOLKIT_ILLUSTRATIONS =
  "chrome/toolkit/skin/classic/global/illustrations";
const BROWSER_SKIN = "browser/chrome/browser/skin/classic/browser";
const BROWSER_CONTENT = "browser/chrome/browser/content/browser";

// Runtime file (relative to the bin dir) -> marmot pose.
export const MARMOT_ILLUSTRATIONS: ReadonlyArray<[string, string]> = [
  // about:neterror: server not found, offline, connection reset.
  [`${TOOLKIT_ILLUSTRATIONS}/no-connection.svg`, "lost"],
  // about:certerror and other security errors.
  [`${TOOLKIT_ILLUSTRATIONS}/security-error.svg`, "warning-sign"],
  // about:preferences, "Kit is your default browser" / "not your default".
  [`${TOOLKIT_ILLUSTRATIONS}/kit-happy.svg`, "celebrating"],
  [`${TOOLKIT_ILLUSTRATIONS}/kit-concerned.svg`, "pondering"],
  // about:preferences, browser icon settings.
  [`${TOOLKIT_ILLUSTRATIONS}/kit-confetti.svg`, "celebrating"],
  [`${TOOLKIT_ILLUSTRATIONS}/kit-holding-lock.svg`, "guard"],
  // about:restartrequired.
  [`${TOOLKIT_ILLUSTRATIONS}/kit-sympathetic.svg`, "hand-up"],
  // about:addons footers (extensions, themes).
  ["chrome/toolkit/skin/classic/mozapps/extensions/kit-addons.svg", "puzzle"],
  ["chrome/toolkit/skin/classic/mozapps/extensions/kit-themes.svg", "painter"],
  // Extensions panel with no extensions installed.
  [`${BROWSER_SKIN}/addons/extensions-panel-empty.svg`, "puzzle"],
  [`${BROWSER_SKIN}/addons/extensions-panel-empty-onboarding.svg`, "puzzle"],
  // about:logins / passwords sidebar.
  [
    "chrome/toolkit/content/global/megalist/icons/cpm-fox-illustration.svg",
    "chest",
  ],
  // Firefox's history sidebar and Firefox View, empty states.
  [`${BROWSER_SKIN}/sidebar/kit-page-history.svg`, "filing"],
  [`${BROWSER_CONTENT}/firefoxview/history-empty.svg`, "filing"],
  // Synced tabs (sidebar, Firefox View): sign in / no devices / error.
  [`${BROWSER_SKIN}/sidebar/kit-tabs-devices.svg`, "syncing"],
  [`${BROWSER_SKIN}/sidebar/kit-qr-tabs-devices-empty.svg`, "syncing"],
  [`${BROWSER_SKIN}/sidebar/kit-tabs-devices-error.svg`, "confused"],
  [`${BROWSER_CONTENT}/firefoxview/synced-tabs-empty.svg`, "syncing"],
  [`${BROWSER_CONTENT}/firefoxview/synced-tabs-error.svg`, "confused"],
  // Profiles panel in the app menu.
  [`${BROWSER_CONTENT}/profiles/assets/kit-profiles-dark.svg`, "badge"],
  [`${BROWSER_CONTENT}/profiles/assets/kit-profiles-light.svg`, "badge"],
  // Password breach alert in the site info panel.
  [`${BROWSER_CONTENT}/controlcenter/assets/fox-concern.svg`, "stop"],
];

const DEFAULT_BOX = { width: "400", height: "400", viewBox: "0 0 400 400" };

// The original's width, height and viewBox; from a marmot we wrote earlier
// they come out unchanged, so applying twice is a no-op.
function svgBox(
  svg: string,
): { width?: string; height?: string; viewBox: string } {
  const tag = svg.match(/<svg\b[^>]*>/s)?.[0];
  if (!tag) return DEFAULT_BOX;
  const attr = (name: string) =>
    tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const width = attr("width");
  const height = attr("height");
  const viewBox = attr("viewBox") ??
    (width && height
      ? `0 0 ${parseFloat(width)} ${parseFloat(height)}`
      : undefined);
  if (!viewBox) return DEFAULT_BOX;
  return { width, height, viewBox };
}

export function marmotSvg(original: string, webp: Uint8Array): string {
  const { width, height, viewBox } = svgBox(original);
  const [x, y, w, h] = viewBox.trim().split(/[\s,]+/);
  const size = [
    width ? ` width="${width}"` : "",
    height ? ` height="${height}"` : "",
  ].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" data-kit-marmot=""${size} viewBox="${viewBox}">
  <image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" href="data:image/webp;base64,${
    encodeBase64(webp)
  }"/>
</svg>
`;
}

// Returns how many illustrations were replaced.
export function applyMarmot(binDir: string): number {
  let replaced = 0;
  for (const [file, pose] of MARMOT_ILLUSTRATIONS) {
    const target = path.join(binDir, file);
    if (!exists(target)) continue;
    const webp = Deno.readFileSync(path.join(MARMOT_DIR, `${pose}.webp`));
    Deno.writeTextFileSync(
      target,
      marmotSvg(Deno.readTextFileSync(target), webp),
    );
    replaced++;
  }
  return replaced;
}
