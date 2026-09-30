// SPDX-License-Identifier: MPL-2.0

// Phosphor icons from @phosphor-icons/core, imported as raw SVG
// (`@phosphor-icons/core/bold/<name>-bold.svg?raw`) and drawn as a CSS mask
// on a `.nw-icon` so they take the current text color.
export function phosphorMask(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
