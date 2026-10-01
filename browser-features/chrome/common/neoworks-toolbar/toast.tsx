// SPDX-License-Identifier: MPL-2.0

// A short confirmation at the bottom of the window, e.g. "Copied link". One at
// a time: a new toast replaces the current one and restarts its timer.

import { createSignal } from "solid-js";
import type { ToastMessage } from "./types.ts";

const VISIBLE_MS = 1600;

const [toast, setToast] = createSignal<ToastMessage | null>(null);
let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(text: string, icon = "check"): void {
  clearTimeout(hideTimer);
  setToast({ text, icon });
  hideTimer = setTimeout(() => setToast(null), VISIBLE_MS);
}

export function hideToast(): void {
  clearTimeout(hideTimer);
  setToast(null);
}

function visibleFlag(): string | undefined {
  if (toast()) {
    return "true";
  }
  return undefined;
}

export function Toast() {
  return (
    <div id="neoworks-toast" data-visible={visibleFlag()} role="status">
      <span class="nw-icon" data-icon={toast()?.icon ?? "check"} />
      <span class="nw-toast-text">{toast()?.text ?? ""}</span>
    </div>
  );
}
