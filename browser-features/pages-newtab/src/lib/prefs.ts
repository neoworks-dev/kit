// SPDX-License-Identifier: MPL-2.0

// Pref access. about:newtab runs with the system principal (also in dev, where
// it maps to localhost:5186) and reads prefs directly. Opened as a plain web
// page, e.g. http://localhost:5186 in a tab, it falls back to localStorage.

interface PrefService {
  PREF_STRING: number;
  getPrefType(prefName: string): number;
  getStringPref(prefName: string): string;
  setStringPref(prefName: string, value: string): void;
}

declare global {
  var Services: { prefs: PrefService } | undefined;
}

export function getStringPref(prefName: string): string | null {
  const prefs = globalThis.Services?.prefs;
  if (!prefs) return localStorage.getItem(prefName);
  return prefs.getPrefType(prefName) === prefs.PREF_STRING
    ? prefs.getStringPref(prefName)
    : null;
}

export function setStringPref(prefName: string, value: string): void {
  const prefs = globalThis.Services?.prefs;
  if (prefs) prefs.setStringPref(prefName, value);
  else localStorage.setItem(prefName, value);
}
