// SPDX-License-Identifier: MPL-2.0

// End-to-end check for the Neoworks double-Space spotlight. Needs a running
// dev browser (`deno task feles-build dev`). Run with:
//   deno run -A tools/src/neoworks_spotlight_e2e.ts

import { MarionetteClient } from "./browser_connector.ts";

const SPOTLIGHT_ID = "neoworks-spotlight";
const SPOTLIGHT_INPUT_ID = "neoworks-spotlight-input";
const OPEN_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 50;

const FIXTURE_PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Spotlight fixture</title>
<input id="field">
<div style="height: 4000px">Double Space fixture</div>`;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function extractHandle(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  const record = value as { handle?: string; value?: string };
  if (record.handle) {
    return record.handle;
  }
  if (record.value) {
    return record.value;
  }
  throw new Error(`Unexpected window handle: ${JSON.stringify(value)}`);
}

function startFixtureServer(): Deno.HttpServer<Deno.NetAddr> {
  return Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, () =>
    new Response(FIXTURE_PAGE, {
      headers: { "content-type": "text/html; charset=utf-8" },
    }));
}

async function pressSpaceTwice(client: MarionetteClient): Promise<void> {
  await client.send("WebDriver:PerformActions", {
    actions: [{
      type: "key",
      id: "neoworks-spotlight-keyboard",
      actions: [
        { type: "keyDown", value: " " },
        { type: "keyUp", value: " " },
        { type: "keyDown", value: " " },
        { type: "keyUp", value: " " },
      ],
    }],
  });
  await client.send("WebDriver:ReleaseActions", {});
}

async function isSpotlightOpen(client: MarionetteClient): Promise<boolean> {
  await client.setContext("chrome");
  const open = await client.executeScript(
    `return document.getElementById(${JSON.stringify(SPOTLIGHT_ID)})?.hasAttribute("data-open") === true;`,
  );
  await client.setContext("content");
  return open === true;
}

async function waitForSpotlightOpen(client: MarionetteClient): Promise<boolean> {
  const deadline = Date.now() + OPEN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isSpotlightOpen(client)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}

async function closeSpotlight(client: MarionetteClient): Promise<void> {
  await client.setContext("chrome");
  await client.executeScript(`
    const input = document.getElementById(${JSON.stringify(SPOTLIGHT_INPUT_ID)});
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  `);
  await client.setContext("content");
}

async function focusPage(client: MarionetteClient): Promise<void> {
  await client.executeScript(`
    document.activeElement?.blur();
    document.body.focus();
  `);
}

async function testDoubleSpaceOnPageOpensSpotlight(
  client: MarionetteClient,
): Promise<void> {
  await focusPage(client);
  await pressSpaceTwice(client);
  assert(
    await waitForSpotlightOpen(client),
    "Double Space on a page did not open the spotlight",
  );
  await closeSpotlight(client);
  assert(!(await isSpotlightOpen(client)), "Escape did not close the spotlight");
}

async function testDoubleSpaceInInputTypesSpaces(
  client: MarionetteClient,
): Promise<void> {
  await client.executeScript(`
    const field = document.getElementById("field");
    field.value = "";
    field.focus();
  `);
  await pressSpaceTwice(client);
  const value = await client.executeScript(
    `return document.getElementById("field").value;`,
  );
  assert(value === "  ", `Input should contain two spaces, got ${JSON.stringify(value)}`);
  assert(
    !(await isSpotlightOpen(client)),
    "Double Space inside an input opened the spotlight",
  );
}

const server = startFixtureServer();
const client = await MarionetteClient.connect();
let originalHandle: string | null = null;
let failed = false;

try {
  originalHandle = extractHandle(await client.send("WebDriver:GetWindowHandle", {}));
  const testHandle = extractHandle(
    await client.send("WebDriver:NewWindow", { type: "tab" }),
  );
  await client.send("WebDriver:SwitchToWindow", { handle: testHandle });
  await client.setContext("content");
  await client.navigate(`http://127.0.0.1:${server.addr.port}/`);

  const tests: Array<[string, (client: MarionetteClient) => Promise<void>]> = [
    ["double Space on page opens spotlight", testDoubleSpaceOnPageOpensSpotlight],
    ["double Space in input types spaces", testDoubleSpaceInInputTypesSpaces],
  ];
  for (const [name, run] of tests) {
    try {
      await run(client);
      console.log(`PASS ${name}`);
    } catch (error) {
      failed = true;
      console.log(`FAIL ${name}: ${errorMessage(error)}`);
    }
  }

  await client.send("WebDriver:CloseWindow", {});
} finally {
  if (originalHandle) {
    await client.send("WebDriver:SwitchToWindow", { handle: originalHandle });
  }
  await client.close();
  await server.shutdown();
}

if (failed) {
  Deno.exit(1);
}
