// SPDX-License-Identifier: MPL-2.0

// Regenerates the committed PNGs from kit.svg. Run after changing the logo:
//   deno run -A static/gecko/branding/generate.ts
// Needs rsvg-convert (librsvg) on PATH.

import * as path from "@std/path";

const DIR = path.dirname(path.fromFileUrl(import.meta.url));

const OUTPUTS: Array<[string, number]> = [
  ["icon16.png", 16],
  ["icon32.png", 32],
  ["icon48.png", 48],
  ["icon64.png", 64],
  ["icon128.png", 128],
  ["icon256.png", 256],
  ["about-logo.png", 192],
  ["about-logo@2x.png", 384],
];

for (const [name, size] of OUTPUTS) {
  const { success, stderr } = await new Deno.Command("rsvg-convert", {
    args: [
      "-w",
      String(size),
      "-h",
      String(size),
      path.join(DIR, "kit.svg"),
      "-o",
      path.join(DIR, name),
    ],
  }).output();
  if (!success) {
    throw new Error(`rsvg-convert failed for ${name}: ${new TextDecoder().decode(stderr)}`);
  }
  console.log(`[branding] ${name} (${size}px)`);
}
