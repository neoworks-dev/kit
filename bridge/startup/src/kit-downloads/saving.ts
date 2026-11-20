// SPDX-License-Identifier: MPL-2.0

// Where downloads go: asked each time, or a folder. Firefox's own prefs, the
// same ones its General settings pane changes.

// false: Firefox asks where to save each file. Kit's default
// (static/gecko/pref/override.ini).
export const USE_DOWNLOAD_DIR_PREF = "browser.download.useDownloadDir";
// 2: the folder in DOWNLOAD_DIR_PREF instead of the system's Downloads.
const FOLDER_LIST_PREF = "browser.download.folderList";
const DOWNLOAD_DIR_PREF = "browser.download.dir";
const CUSTOM_FOLDER = 2;

interface FilePicker {
  init(browsingContext: BrowsingContext, title: string, mode: number): void;
  open(callback: (result: number) => void): void;
  file: nsIFile | null;
  displayDirectory: nsIFile | null;
}

const filePickerConstants = Ci.nsIFilePicker as unknown as {
  modeGetFolder: number;
  returnOK: number;
};

export function asksWhereToSave(): boolean {
  return !Services.prefs.getBoolPref(USE_DOWNLOAD_DIR_PREF, true);
}

export function setAsksWhereToSave(ask: boolean): void {
  Services.prefs.setBoolPref(USE_DOWNLOAD_DIR_PREF, !ask);
}

export async function downloadFolder(): Promise<string> {
  const { Downloads } = ChromeUtils.importESModule(
    "resource://gre/modules/Downloads.sys.mjs",
  ) as { Downloads: { getPreferredDownloadsDirectory(): Promise<string> } };
  return await Downloads.getPreferredDownloadsDirectory();
}

// /home/me/Downloads reads as ~/Downloads.
export function displayPath(path: string): string {
  const home = Services.dirsvc.get("Home", Ci.nsIFile).path;
  if (path === home || path.startsWith(home + "/")) {
    return "~" + path.slice(home.length);
  }
  return path;
}

function localFile(path: string): nsIFile {
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  return file;
}

export async function openDownloadFolder(): Promise<void> {
  const { DownloadsCommon } = ChromeUtils.importESModule(
    "moz-src:///browser/components/downloads/DownloadsCommon.sys.mjs",
  ) as { DownloadsCommon: { showDirectory(directory: nsIFile): void } };
  DownloadsCommon.showDirectory(localFile(await downloadFolder()));
}

// Resolves once the picker closes; changes nothing if it was canceled.
export async function chooseDownloadFolder(win: Window): Promise<void> {
  const picker = Cc["@mozilla.org/filepicker;1"].createInstance(
    Ci.nsIFilePicker,
  ) as unknown as FilePicker;
  picker.init(
    win.browsingContext,
    "Save downloads to",
    filePickerConstants.modeGetFolder,
  );
  picker.displayDirectory = localFile(await downloadFolder());
  const result = await new Promise<number>((resolve) => picker.open(resolve));
  if (result !== filePickerConstants.returnOK || !picker.file) {
    return;
  }
  Services.prefs.setComplexValue(DOWNLOAD_DIR_PREF, Ci.nsIFile, picker.file);
  Services.prefs.setIntPref(FOLDER_LIST_PREF, CUSTOM_FOLDER);
}

// Calls `onChange` when any of the prefs above changes. Returns a stop function.
export function watchSaving(onChange: () => void): () => void {
  const observer = { observe: onChange };
  const prefs = [USE_DOWNLOAD_DIR_PREF, FOLDER_LIST_PREF, DOWNLOAD_DIR_PREF];
  for (const pref of prefs) {
    Services.prefs.addObserver(pref, observer);
  }
  return () => {
    for (const pref of prefs) {
      Services.prefs.removeObserver(pref, observer);
    }
  };
}
