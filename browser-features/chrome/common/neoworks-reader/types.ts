// SPDX-License-Identifier: MPL-2.0

// NWReaderStyle.sys.mts: registers Kit's reader view sheet once for all
// windows.
export interface ReaderStyleModule {
  setReaderStyle(css: string): void;
}
