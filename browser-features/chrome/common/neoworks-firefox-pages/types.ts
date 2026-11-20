// SPDX-License-Identifier: MPL-2.0

// NWPageStyles.sys.mts, as the chrome feature imports it.
export interface PageStylesModule {
  setPageStyle(css: string): void;
}
