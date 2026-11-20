// SPDX-License-Identifier: MPL-2.0

// "Kit updated to 12.20.0", once after an update (kit-update installs new
// versions between starts, see tools/src/packager.ts). The version Kit last
// ran as is kept in a pref; the first window to see it change shows the
// toast and stores the new one, so later windows don't repeat it.

import { showToast } from "./toast.tsx";

const LAST_VERSION_PREF = "neoworks.update.lastVersion";
const VISIBLE_MS = 6000;
// After the window has drawn, so the toast isn't missed during startup.
const DELAY_MS = 1500;

interface ConstantsModule {
  NoranekoConstants: { version2: string };
}

function currentVersion(): string {
  const { NoranekoConstants } = ChromeUtils.importESModule(
    "resource://noraneko/modules/NoranekoConstants.sys.mjs",
  ) as ConstantsModule;
  return NoranekoConstants.version2 ?? "";
}

// Returns a function that cancels the pending notice, for hot reload.
export function noticeUpdate(): () => void {
  let version = "";
  try {
    version = currentVersion();
  } catch (error) {
    console.error("[neoworks-toolbar] Can't read Kit's version:", error);
    return () => {};
  }
  if (!version) {
    return () => {};
  }
  const last = Services.prefs.getStringPref(LAST_VERSION_PREF, "");
  if (last === version) {
    return () => {};
  }
  Services.prefs.setStringPref(LAST_VERSION_PREF, version);
  // A first start has nothing to compare with, and a downgrade isn't news.
  if (!last || Services.vc.compare(version, last) <= 0) {
    return () => {};
  }
  const timer = setTimeout(
    () => showToast(`Kit updated to ${version}`, "arrow-clockwise", VISIBLE_MS),
    DELAY_MS,
  );
  return () => clearTimeout(timer);
}
