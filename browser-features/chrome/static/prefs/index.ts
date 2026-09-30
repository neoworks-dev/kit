// SPDX-License-Identifier: MPL-2.0

export function initBeforeSessionStoreInit() {
  const prefs = Services.prefs.getDefaultBranch(null as unknown as string);

  //* The runtime's UA carries its app name in place of "Firefox"
  //* (e.g. Gecko/20100101 Noraneko/134.0), so sites see Firefox instead.
  // https://searchfox.org/mozilla-central/rev/e24277e20c492b4a785b4488af02cca062ec7c2c/netwerk/protocol/http/nsHttpHandler.cpp#905

  //https://searchfox.org/mozilla-central/rev/e24277e20c492b4a785b4488af02cca062ec7c2c/remote/cdp/JSONHandler.sys.mjs#60

  const { userAgent } = Cc[
    "@mozilla.org/network/protocol;1?name=http"
  ].getService(Ci.nsIHttpProtocolHandler);
  prefs.setStringPref(
    "general.useragent.override",
    userAgent.replace("Noraneko", "Firefox"),
  );
  prefs.setBoolPref("browser.preferences.moreFromMozilla", false);
  // Closing the last tab leaves an empty new tab instead of closing the window.
  prefs.setBoolPref("browser.tabs.closeWindowWithLastTab", false);
}

export function init() {}
