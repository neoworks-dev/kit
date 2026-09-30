// SPDX-License-Identifier: MPL-2.0

// solid-xul has no refs; focus inputs by id once they are rendered.
export function focusInputSoon(inputId: string): void {
  queueMicrotask(() => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  });
}
