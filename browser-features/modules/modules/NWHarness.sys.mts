// SPDX-License-Identifier: MPL-2.0

// The AI sidebar's harness sidecar: one `neoworks-harness serve` process
// (switchboard) for the whole app, started on first use and stopped on quit.
// Browser windows connect to it with HarnessClient over a local WebSocket.
//
// The sidecar runs from a switchboard checkout (neoworks.ai.harness.dir; dev
// profiles point it at libs/switchboard) with bun, which runs its TypeScript
// sources directly.

const { Subprocess } = ChromeUtils.importESModule(
  "resource://gre/modules/Subprocess.sys.mjs",
) as { Subprocess: SubprocessApi };

interface SubprocessPipe {
  readString(): Promise<string>;
}

interface SubprocessProcess {
  stdout: SubprocessPipe;
  stderr: SubprocessPipe;
  kill(timeoutMs?: number): Promise<{ exitCode: number }>;
  wait(): Promise<{ exitCode: number }>;
}

interface SubprocessApi {
  call(options: {
    command: string;
    arguments: string[];
    workdir?: string;
    environment?: Record<string, string>;
    environmentAppend?: boolean;
    stderr?: "pipe" | "stdout";
  }): Promise<SubprocessProcess>;
  pathSearch(command: string): Promise<string>;
}

export interface HarnessEndpoint {
  url: string;
  token: string;
}

const HARNESS_DIR_PREF = "neoworks.ai.harness.dir";
const RUNTIME_PREF = "neoworks.ai.harness.runtime";
const DEFAULT_RUNTIME = "bun";
const CLI_ENTRY = "src/cli/index.ts";
const READY_TIMEOUT_MS = 15_000;
const LISTENING = /listening on (ws:\/\/\S+)/;

let starting: Promise<HarnessEndpoint> | null = null;
let running: SubprocessProcess | null = null;

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Reads stdout until the sidecar prints its address.
async function waitForAddress(process: SubprocessProcess): Promise<string> {
  let output = "";
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const chunk = await process.stdout.readString();
    if (chunk === "") {
      break;
    }
    output += chunk;
    const match = LISTENING.exec(output);
    if (match) {
      return match[1];
    }
  }
  throw new Error(`the harness sidecar didn't start: ${output.trim() || "no output"}`);
}

// Stops the sidecar with the app; otherwise it would outlive Kit.
const quitObserver = {
  observe(): void {
    running?.kill();
    running = null;
    starting = null;
  },
};

async function start(): Promise<HarnessEndpoint> {
  const harnessDir = Services.prefs.getStringPref(HARNESS_DIR_PREF, "");
  if (!harnessDir) {
    throw new Error(`${HARNESS_DIR_PREF} isn't set: point it at a switchboard checkout`);
  }
  const runtime = await Subprocess.pathSearch(
    Services.prefs.getStringPref(RUNTIME_PREF, DEFAULT_RUNTIME),
  );
  const token = randomToken();
  const process = await Subprocess.call({
    command: runtime,
    arguments: [CLI_ENTRY, "serve"],
    workdir: harnessDir,
    environment: { NEOWORKS_HARNESS_TOKEN: token },
    environmentAppend: true,
    stderr: "stdout",
  });
  running = process;
  process.wait().then(() => {
    if (running === process) {
      running = null;
      starting = null;
    }
  });
  try {
    const url = await waitForAddress(process);
    Services.obs.addObserver(quitObserver, "quit-application");
    return { url, token };
  } catch (error) {
    process.kill();
    throw error;
  }
}

// The running sidecar's address, starting it first if needed.
export function ensureHarness(): Promise<HarnessEndpoint> {
  if (!starting) {
    starting = start().catch((error: unknown) => {
      starting = null;
      throw error;
    });
  }
  return starting;
}
