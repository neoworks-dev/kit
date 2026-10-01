// SPDX-License-Identifier: MPL-2.0

// Whether Kit is the system's default browser, and the request to make it so,
// through Firefox's ShellService. On Linux this registers Kit's .desktop file,
// so it only works for an installed Kit.

import { createSignal } from "solid-js";
import type { DefaultBrowserState } from "./types.ts";

interface ShellServiceModule {
  ShellService: {
    isDefaultBrowser(startupCheck: boolean, forAllTypes: boolean): boolean;
    setAsDefault(): Promise<void>;
  };
}

const [state, setState] = createSignal<DefaultBrowserState>("unknown");

export const defaultBrowserState = state;

function shellService(): ShellServiceModule["ShellService"] {
  return (ChromeUtils.importESModule(
    "moz-src:///browser/components/shell/ShellService.sys.mjs",
  ) as ShellServiceModule).ShellService;
}

function isDefault(): boolean {
  try {
    return shellService().isDefaultBrowser(false, false);
  } catch (error) {
    console.error("[neoworks-onboarding] Can't tell the default browser:", error);
    return false;
  }
}

export function checkDefaultBrowser(): void {
  setState(isDefault() ? "default" : "not-default");
}

export async function makeDefaultBrowser(): Promise<void> {
  setState("setting");
  try {
    await shellService().setAsDefault();
  } catch (error) {
    console.error("[neoworks-onboarding] Making Kit the default browser failed:", error);
  }
  setState(isDefault() ? "default" : "failed");
}
