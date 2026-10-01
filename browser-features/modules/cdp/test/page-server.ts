// SPDX-License-Identifier: MPL-2.0

// Test pages for the CDP engine's and Grove's browser tests: a local HTTP
// server (the Remote Agent's httpd) with fixed pages, and tabs to load them in.

interface HttpRequest {
  path: string;
}

interface HttpResponse {
  setStatusLine(version: string | null, code: number, description: string): void;
  setHeader(name: string, value: string, merge?: boolean): void;
  write(data: string): void;
}

interface HttpServer {
  _start(port: number, host: string): void;
  stop(callback: () => void): void;
  registerPathHandler(path: string, handler: (request: HttpRequest, response: HttpResponse) => void): void;
  identity: { primaryPort: number; add(scheme: string, host: string, port: number): void };
}

const { HttpServer } = ChromeUtils.importESModule(
  "chrome://remote/content/server/httpd.sys.mjs",
) as { HttpServer: new () => HttpServer };

export interface TestTab extends Element {
  linkedBrowser: XULBrowserElement;
  label: string;
}

interface TestGBrowser {
  selectedTab: TestTab;
  tabs: TestTab[];
  addTab(uri: string, options: { triggeringPrincipal: nsIPrincipal }): TestTab;
  removeTab(tab: TestTab): void;
}

export function testGBrowser(): TestGBrowser {
  return (window as unknown as { gBrowser: TestGBrowser }).gBrowser;
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Polls until `check` returns something truthy, or fails after `timeout`.
export async function waitFor<T>(check: () => T | Promise<T>, what: string, timeout = 10_000): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) {
      return value as NonNullable<T>;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

export interface PageServer {
  url(path: string): string;
  stop(): Promise<void>;
}

// Serves `pages` (path → HTML); anything else is a 404.
export function startPageServer(pages: Record<string, string>): PageServer {
  const server = new HttpServer();
  server._start(-1, "127.0.0.1");
  const port = server.identity.primaryPort;
  server.identity.add("http", "127.0.0.1", port);
  for (const [path, html] of Object.entries(pages)) {
    server.registerPathHandler(path, (_request, response) => {
      response.setStatusLine("1.1", 200, "OK");
      response.setHeader("Content-Type", "text/html; charset=utf-8", false);
      response.write(html);
    });
  }
  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    stop: () => new Promise((resolve) => server.stop(() => resolve())),
  };
}

// Opens `url` in a new selected tab and waits for it to load.
export async function openTestTab(url: string): Promise<TestTab> {
  const gBrowser = testGBrowser();
  const tab = gBrowser.addTab(url, {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  });
  gBrowser.selectedTab = tab;
  await waitFor(
    () => tab.linkedBrowser.currentURI?.spec === url && !tab.linkedBrowser.webProgress?.isLoadingDocument,
    `${url} to load`,
  );
  return tab;
}
