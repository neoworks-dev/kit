// SPDX-License-Identifier: MPL-2.0

// Replaces the runtime's onnxruntime with a newer official build. The Floorp
// runtime ships Mozilla's onnxruntime 1.22, whose MatMulNBits kernel only
// takes 4-bit weights; the AI sidebar's local decider (#54) needs 8-bit ones.
// Gecko loads the library at runtime through onnxruntime's C API, which newer
// versions keep compatible, so the file can be swapped as is.
//
// Dev, stage and test builds only: production builds compile the runtime with
// mach, which fetches its own onnxruntime. Linux x64 only for now; other
// platforms keep the runtime's library.

import * as path from "@std/path";
import { BIN_DIR, PATHS } from "../../../tools/src/defines.ts";
import { exists, Logger } from "../../../tools/src/utils.ts";

const logger = new Logger("onnxruntime");

const VERSION = "1.30.0";

interface Build {
  asset: string;
  sha256: string;
  // Inside the archive.
  library: string;
  // Inside the runtime's bin directory.
  target: string;
}

const BUILDS: Record<string, Build> = {
  "linux-x86_64": {
    asset: `onnxruntime-linux-x64-${VERSION}.tgz`,
    sha256: "a5ed5a3cac51fbb2e90da632ae43d19212faaa20e76484e62bcb7c23ddb3b3fd",
    library: `onnxruntime-linux-x64-${VERSION}/lib/libonnxruntime.so.${VERSION}`,
    target: "libonnxruntime.so",
  },
};

const CACHE_DIR = path.join(PATHS.root, "_dist", "cache", "onnxruntime");

async function sha256(file: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await Deno.readFile(file));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function download(build: Build): Promise<string> {
  const archive = path.join(CACHE_DIR, build.asset);
  if (exists(archive) && await sha256(archive) === build.sha256) {
    return archive;
  }
  await Deno.mkdir(CACHE_DIR, { recursive: true });
  const url = `https://github.com/microsoft/onnxruntime/releases/download/v${VERSION}/${build.asset}`;
  logger.info(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Downloading ${url} failed: HTTP ${response.status}`);
  }
  await Deno.writeFile(archive, response.body);
  const actual = await sha256(archive);
  if (actual !== build.sha256) {
    await Deno.remove(archive);
    throw new Error(`${build.asset} has sha256 ${actual}, expected ${build.sha256}`);
  }
  return archive;
}

async function extract(archive: string, build: Build): Promise<string> {
  const library = path.join(CACHE_DIR, build.library);
  if (exists(library)) {
    return library;
  }
  const { success, stderr } = await new Deno.Command("tar", {
    args: ["-xzf", archive, "-C", CACHE_DIR, build.library],
    stderr: "piped",
  }).output();
  if (!success) {
    throw new Error(`Extracting ${build.library} failed: ${new TextDecoder().decode(stderr)}`);
  }
  return library;
}

export async function run(): Promise<void> {
  const build = BUILDS[`${Deno.build.os}-${Deno.build.arch}`];
  if (!build) {
    logger.info(`No onnxruntime ${VERSION} for ${Deno.build.os}-${Deno.build.arch}; keeping the runtime's.`);
    return;
  }
  const target = path.join(BIN_DIR, build.target);
  if (!exists(target)) {
    logger.warn(`${target} is missing; is the runtime installed?`);
    return;
  }
  try {
    const library = await extract(await download(build), build);
    if (await sha256(target) === await sha256(library)) {
      return;
    }
    await Deno.copyFile(library, target);
    logger.success(`Installed onnxruntime ${VERSION}`);
  } catch (error) {
    // The browser still runs on the runtime's own onnxruntime; only the local
    // decider's 8-bit models need this one.
    logger.warn(`Keeping the runtime's onnxruntime: ${error instanceof Error ? error.message : error}`);
  }
}
