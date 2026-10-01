// SPDX-License-Identifier: MPL-2.0

import * as path from "@std/path";
import {
  createSymlink,
  exists,
  Logger,
  runCommandChecked,
  safeRemove,
} from "./utils.ts";
import { BIN_DIR, PROD_BIN_DIR, PROJECT_ROOT } from "./defines.ts";

const logger = new Logger("injector");

export interface XhtmlInjectionOptions {
  devPages?: boolean;
  isCI?: boolean;
  allowBrowserHttpLoader?: boolean;
  // Overrides the runtime directory (packaging); defaults to _dist/bin's.
  binPath?: string;
}

export function buildXhtmlInjectionArgs(
  scriptPath: string,
  binPath: string,
  options: XhtmlInjectionOptions = {},
): string[] {
  const args = ["run", "--allow-read", "--allow-write", scriptPath, binPath];
  if (options.devPages) args.push("--dev");
  if (options.allowBrowserHttpLoader) {
    args.push("--allow-browser-http-loader");
  }
  return args;
}

export async function injectXhtmlFromTs(
  options: XhtmlInjectionOptions = {},
): Promise<void> {
  const scriptPath = path.join(PROJECT_ROOT, "tools", "scripts", "xhtml.ts");
  const isCI = options.isCI ?? false;
  let binPath = options.binPath ?? (!isCI ? BIN_DIR : PROD_BIN_DIR);

  // In CI, the default PROJECT_ROOT is incorrect because scripts run from a subdir.
  // We must manually construct the correct path to the build artifacts.
  if (isCI) {
    // The real project root in CI is one level above the script's calculated PROJECT_ROOT.
    const ciProjectRoot = path.resolve(PROJECT_ROOT, "..");
    const distDir = path.join(
      ciProjectRoot,
      "obj-artifact-build-output",
      "dist",
    );

    const canonPlatform = Deno.env.get("CANON_PLATFORM");
    if (canonPlatform === "macOS-x86_64") {
      let appBundleFound = false;
      try {
        for await (const dirEntry of Deno.readDir(distDir)) {
          if (dirEntry.isDirectory && dirEntry.name.endsWith(".app")) {
            binPath = path.join(
              distDir,
              dirEntry.name,
              "Contents",
              "Resources",
            );
            appBundleFound = true;
            logger.info(
              `Found macOS app bundle, setting binPath to: ${binPath}`,
            );
            break;
          }
        }
      } catch (e: unknown) {
        logger.warn(
          `Could not read dist directory ${distDir} for macOS .app bundle search: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
      if (!appBundleFound) {
        logger.warn(
          `macOS platform detected, but no .app bundle found in ${distDir}. Using default PROD_BIN_DIR.`,
        );
        // The default PROD_BIN_DIR is also relative to the wrong root, so we construct an absolute path.
        binPath = path.join(distDir, "bin");
      }
    } else {
      // For non-macOS CI builds, the path is obj-artifact-build-output/dist/bin
      binPath = path.join(distDir, "bin");
      logger.info(`CI platform detected, setting binPath to: ${binPath}`);
    }
  }

  const args = buildXhtmlInjectionArgs(scriptPath, binPath, options);

  const result = runCommandChecked("deno", args);
  if (!result.success) {
    throw new Error(`Failed to inject XHTML: ${result.stderr}`);
  }
  logger.success("XHTML injection complete.");
  // Keep function legitimately async to match callers that await it
  // and satisfy the lint rule requiring at least one await.
  await Promise.resolve();
}

export function createManifest(mode: string, dirPath: string) {
  let manifestContent = [
    "content noraneko content/ contentaccessible=yes",
    "content noraneko-startup startup/ contentaccessible=yes",
    "resource noraneko resource/ contentaccessible=yes",
  ].join("\n");

  // if (dev) the pages should be served in vite dev server
  // stage and productions needs static contents
  if (mode !== "dev") {
    manifestContent +=
      "\ncontent noraneko-newtab pages-newtab/ contentaccessible=yes";
  }

  Deno.writeTextFileSync(
    path.join(dirPath, "noraneko.manifest"),
    manifestContent,
  );
}

/**
 * This creates chrome.manifest, and symlinks the dists to firefox binary dir.
 * for production, only symlinks will be created.
 * @param mode
 * @param dirName
 */
export function run(mode: string, dirName = "noraneko-devdir"): void {
  const manifestPath = path.join(BIN_DIR, "chrome.manifest");

  if (mode === "dev" || mode === "stage") {
    let manifest = "";
    if (exists(manifestPath)) {
      manifest = Deno.readTextFileSync(manifestPath);
    }
    const entry = `manifest ${dirName}/noraneko.manifest`;
    if (!manifest.includes(entry)) {
      Deno.writeTextFileSync(manifestPath, `${manifest}\n${entry}`);
    }
  }

  const dirPath = path.join(BIN_DIR, dirName);
  try {
    if (exists(dirPath)) {
      safeRemove(dirPath);
    }
    Deno.mkdirSync(dirPath, { recursive: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`Failed to prepare directory ${dirPath}: ${msg}`);
    throw e;
  }

  createManifest(mode, dirPath);

  const mounts: Array<[string, string]> = [
    ["content", "bridge/loader-features/_dist"],
    ["startup", "bridge/startup/_dist"],
    ["resource", "bridge/loader-modules/_dist"],
    ["pages-newtab", "browser-features/pages-newtab/_dist"],
  ];

  for (const [subdir, target] of mounts) {
    const linkPath = path.resolve(dirPath, subdir);
    const targetPath = path.resolve(target);
    try {
      if (exists(linkPath)) {
        safeRemove(linkPath);
      }
    } catch {
      // ignore
    }

    try {
      createSymlink(linkPath, targetPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(
        `Failed to create symlink ${linkPath} -> ${targetPath}: ${msg}`,
      );
    }
  }

  logger.success("Manifest injected successfully.");
}
