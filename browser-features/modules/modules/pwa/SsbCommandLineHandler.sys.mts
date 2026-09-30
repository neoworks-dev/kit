/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// The prebuilt Floorp runtime registers a command-line handler at this path
// (compiled into libxul), so the module must exist. Kit has no web app
// windows; the handler leaves the command line untouched. Remove once Kit
// ships its own runtime.

type TQueryInterface = <T extends nsIID>(aIID: T) => nsQIResult<T>;

export class SSBCommandLineHandler {
  QueryInterface = ChromeUtils.generateQI([
    "nsICommandLineHandler",
  ]) as TQueryInterface;

  handle(_cmdLine: nsICommandLine): void {}

  get helpInfo(): string {
    return "";
  }
}
