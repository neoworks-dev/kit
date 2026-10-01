// SPDX-License-Identifier: MPL-2.0

// First launch setup: welcome, import, theme, settings, done. It opens once,
// in the first window of a profile, and again from the spotlight ("Run First
// Launch Setup"). Every step applies right away, so leaving early keeps
// whatever was chosen so far.

import { createSignal } from "solid-js";
import { tabbrowser } from "../neoworks-sidebar/tabbrowser.ts";
import { detectSources } from "./browser-import.ts";
import { readSettings } from "./settings.ts";
import { readActiveTheme } from "./themes.ts";
import type { OnboardingStep } from "./types.ts";

const COMPLETED_PREF = "neoworks.onboarding.completed";

export const STEPS: OnboardingStep[] = ["welcome", "import", "theme", "settings", "done"];

const [isOpen, setIsOpen] = createSignal(false);
const [step, setStep] = createSignal<OnboardingStep>("welcome");

export { isOpen, step };

export const PANEL_ID = "neoworks-onboarding-panel";

const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
) as { PrivateBrowsingUtils: { isWindowPrivate(window: Window): boolean } };

function browserWindowCount(): number {
  let count = 0;
  for (const _ of Services.wm.getEnumerator("navigator:browser")) {
    count += 1;
  }
  return count;
}

// Only the profile's first window: a second window opened before the setup
// was finished doesn't get a second copy.
export function shouldOpenOnLaunch(): boolean {
  return !Services.prefs.getBoolPref(COMPLETED_PREF, false) &&
    !PrivateBrowsingUtils.isWindowPrivate(window) &&
    browserWindowCount() === 1;
}

// The panel takes keyboard focus, so Kit's key sequences stay off while it's
// open (chrome-keys.ts skips [data-nw-keys-off]).
function focusPanel(): void {
  requestAnimationFrame(() => {
    const target = document
      .getElementById(PANEL_ID)
      ?.querySelector<HTMLElement>("[data-autofocus]");
    target?.focus();
  });
}

export function goToStep(next: OnboardingStep): void {
  setStep(next);
  focusPanel();
}

export function goBy(offset: number): void {
  const index = STEPS.indexOf(step()) + offset;
  const next = STEPS[Math.max(0, Math.min(STEPS.length - 1, index))];
  goToStep(next);
}

export function openOnboarding(): void {
  if (isOpen()) {
    return;
  }
  readSettings();
  readActiveTheme();
  detectSources();
  setIsOpen(true);
  goToStep("welcome");
}

export function closeOnboarding(): void {
  if (!isOpen()) {
    return;
  }
  Services.prefs.setBoolPref(COMPLETED_PREF, true);
  setIsOpen(false);
  tabbrowser().selectedBrowser.focus();
}
