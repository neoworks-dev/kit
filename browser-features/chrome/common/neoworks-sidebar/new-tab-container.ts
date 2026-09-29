// SPDX-License-Identifier: MPL-2.0

// Firefox's own new-tab paths (File menu, middle-clicking empty tab strip
// space, BrowserCommands.openTab, the tab left behind when the last tab
// closes) open the new tab page without a container. Route them into the
// default container, like Kit's `t` and + button.

import { defaultContainerId } from "./containers.ts";

interface AddTabParams {
  userContextId?: number | null;
  createLazyBrowser?: boolean;
  bulkOrderedOpen?: boolean;
  [key: string]: unknown;
}

type AddTab = (uri: string, params?: AddTabParams) => unknown;

const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
) as { PrivateBrowsingUtils: { isWindowPrivate(window: Window): boolean } };

const browserWindow = window as unknown as {
  gBrowser: { addTab: AddTab };
  BROWSER_NEW_TAB_URL: string;
};

function isNewTabPage(uri: string): boolean {
  return uri === browserWindow.BROWSER_NEW_TAB_URL || uri === "about:newtab" ||
    uri === "about:home";
}

// Session restore recreates tabs lazily or in bulk and already knows their
// container; an explicit userContextId (even 0) is a deliberate choice.
function needsDefaultContainer(uri: string, params: AddTabParams | undefined): boolean {
  if (!isNewTabPage(uri)) {
    return false;
  }
  if (params?.createLazyBrowser || params?.bulkOrderedOpen) {
    return false;
  }
  return params?.userContextId === undefined || params.userContextId === null;
}

// Returns a function that restores the original addTab for hot reload.
export function routeNewTabsToDefaultContainer(): () => void {
  if (PrivateBrowsingUtils.isWindowPrivate(window)) {
    return () => {};
  }
  const tabbrowser = browserWindow.gBrowser;
  const originalAddTab = tabbrowser.addTab;
  tabbrowser.addTab = function (uri: string, params?: AddTabParams) {
    if (!needsDefaultContainer(uri, params)) {
      return originalAddTab.call(this, uri, params);
    }
    return originalAddTab.call(this, uri, { ...params, userContextId: defaultContainerId() });
  };
  return () => {
    tabbrowser.addTab = originalAddTab;
  };
}
