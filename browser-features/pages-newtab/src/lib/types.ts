// SPDX-License-Identifier: MPL-2.0

// The active theme's new tab colors as CSS colors, from the NRStartPage
// actor; null for the ones the theme doesn't set.
export interface NewTabTheme {
  background: string | null;
  text: string | null;
  card: string | null;
}
