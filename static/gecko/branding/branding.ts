// SPDX-License-Identifier: MPL-2.0

// Writes Kit's branding over the prebuilt Floorp runtime's: brand names (window
// title, Firefox's own menus and dialogs, about:preferences), the about dialog
// logo and style, and the window icons. Runs on every build; a freshly
// downloaded runtime starts out as Floorp again.

import * as path from "@std/path";
import { BIN_DIR } from "../../../tools/src/defines.ts";
import { exists, Logger } from "../../../tools/src/utils.ts";

const logger = new Logger("branding");

const BRANDING_DIR = path.dirname(path.fromFileUrl(import.meta.url));

export const BRAND = {
  shortName: "Kit",
  fullName: "Kit",
  vendor: "Neoworks",
} as const;

export function brandFtl(): string {
  return `# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

-brand-shorter-name = ${BRAND.shortName}
-brand-short-name = ${BRAND.shortName}
-brand-shortcut-name = ${BRAND.shortName}
-brand-full-name = ${BRAND.fullName}
-brand-product-name = ${BRAND.shortName}
-vendor-short-name = ${BRAND.vendor}
trademarkInfo = ${BRAND.shortName} is made by ${BRAND.vendor}.
`;
}

export function brandProperties(): string {
  return `# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

brandShorterName=${BRAND.shortName}
brandShortName=${BRAND.shortName}
brandFullName=${BRAND.fullName}
vendorShortName=${BRAND.vendor}
`;
}

export function brandDtd(): string {
  return `<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->

<!ENTITY  brandShorterName      "${BRAND.shortName}">
<!ENTITY  brandShortName        "${BRAND.shortName}">
<!ENTITY  brandFullName         "${BRAND.fullName}">
`;
}

// Subdirectories of `dir`, or none if it doesn't exist.
function subdirs(dir: string): string[] {
  if (!exists(dir)) return [];
  return [...Deno.readDirSync(dir)]
    .filter((entry) => entry.isDirectory)
    .map((entry) => path.join(dir, entry.name));
}

function write(file: string, content: string): void {
  if (!exists(path.dirname(file))) return;
  Deno.writeTextFileSync(file, content);
}

function copy(name: string, target: string): void {
  if (!exists(path.dirname(target))) return;
  Deno.copyFileSync(path.join(BRANDING_DIR, name), target);
}

export function run(binDir: string = BIN_DIR): void {
  if (!exists(binDir)) {
    logger.warn(`Runtime not found at ${binDir}, skipping branding`);
    return;
  }

  // Brand strings, for every locale the runtime ships.
  for (const locale of subdirs(path.join(binDir, "browser", "localization"))) {
    write(path.join(locale, "branding", "brand.ftl"), brandFtl());
  }
  for (const locale of subdirs(path.join(binDir, "browser", "chrome"))) {
    const dir = path.join(locale, "locale", "branding");
    write(path.join(dir, "brand.properties"), brandProperties());
    write(path.join(dir, "brand.dtd"), brandDtd());
  }

  // chrome://branding/content/
  const content = path.join(
    binDir,
    "browser",
    "chrome",
    "browser",
    "content",
    "branding",
  );
  for (const size of [16, 32, 48, 64, 128]) {
    copy(`icon${size}.png`, path.join(content, `icon${size}.png`));
  }
  copy("about-logo.png", path.join(content, "about-logo.png"));
  copy("about-logo@2x.png", path.join(content, "about-logo@2x.png"));
  copy("about-logo.png", path.join(content, "about-logo-private.png"));
  copy("about-logo@2x.png", path.join(content, "about-logo-private@2x.png"));
  copy("kit.svg", path.join(content, "about-logo.svg"));
  copy("wordmark.svg", path.join(content, "about-wordmark.svg"));
  copy("wordmark.svg", path.join(content, "firefox-wordmark.svg"));
  copy("aboutDialog.css", path.join(content, "aboutDialog.css"));

  // Window icons (Linux/Windows).
  const icons = path.join(binDir, "browser", "chrome", "icons", "default");
  for (const size of [16, 32, 48, 64, 128]) {
    copy(`icon${size}.png`, path.join(icons, `default${size}.png`));
  }

  logger.success("Applied Kit branding to the runtime.");
}
