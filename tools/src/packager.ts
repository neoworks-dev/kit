// SPDX-License-Identifier: MPL-2.0

// `feles-build package`: a standalone Kit for Linux, as a tarball. It takes
// the locked release runtime (not the debug one development uses), applies
// Kit's patches, prefs and branding to it like a dev build does, and puts the
// production build of Kit's own code next to it as real files. A `kit`
// launcher keeps Kit's profile apart from any Floorp install and an
// install.sh copies Kit to ~/.local/share/kit/app and registers it with the
// desktop, so it can be the default browser.
//
// The result runs without the dev servers: the production startup script
// loads chrome://noraneko/ (bridge/startup/src/chrome_root.ts).

import * as path from "@std/path";
import * as Branding from "../../static/gecko/branding/branding.ts";
import * as OnnxRuntime from "../../static/gecko/onnxruntime/onnxruntime.ts";
import * as Pref from "../../static/gecko/pref/pref.ts";
import * as Builder from "./builder.ts";
import { BRANDING, PROJECT_ROOT } from "./defines.ts";
import { installLockedRuntime } from "./initializer.ts";
import { createManifest, injectXhtmlFromTs } from "./injector.ts";
import * as Patcher from "./patcher.ts";
import { loadRuntimeLock } from "./runtime_lock.ts";
import * as Update from "./update.ts";
import { exists, Logger, runCommandChecked, safeRemove } from "./utils.ts";

const logger = new Logger("packager");

const PACKAGE_ROOT = path.join(PROJECT_ROOT, "_dist", "package");
const APP_NAME = "kit";
// Where Kit's code goes inside the runtime, and the line that mounts it.
const KIT_DIR_NAME = "noraneko";
const KIT_MANIFEST_ENTRY = `manifest ${KIT_DIR_NAME}/noraneko.manifest`;

// The production build's outputs, by chrome.manifest mount (see
// injector.createManifest).
const MOUNTS: Array<[string, string]> = [
  ["content", "bridge/loader-features/_dist"],
  ["startup", "bridge/startup/_dist"],
  ["resource", "bridge/loader-modules/_dist"],
  ["pages-newtab", "browser-features/pages-newtab/_dist"],
];

// Kit has no update server yet; the runtime's update URL is a placeholder.
const POLICIES = { policies: { DisableAppUpdate: true } };

const LAUNCHER = `#!/bin/sh
# Starts Kit with its own profile, so it never shares one with Floorp.
# MOZ_APP_LAUNCHER makes "Make default" register this script rather than the
# bare binary, which would open Floorp's default profile.
KIT_DIR="$(dirname "$(readlink -f "$0")")"
PROFILE="\${KIT_PROFILE:-\${XDG_DATA_HOME:-$HOME/.local/share}/kit/profile}"
mkdir -p "$PROFILE"
export MOZ_APP_LAUNCHER="$KIT_DIR/kit"
exec "$KIT_DIR/${BRANDING.base_name}" --profile "$PROFILE" --name kit --class kit "$@"
`;

const INSTALL_SCRIPT = `#!/bin/sh
# Copies this Kit to ~/.local/share/kit/app and registers it with the
# desktop: an app menu entry that handles web links, its icon and a kit
# command. The unpacked folder can be deleted afterwards.
#   ./install.sh              install, or update an installed Kit
#   ./install.sh --default    install and make Kit the default browser
#   ./install.sh --uninstall  remove the app, entry, icon and command
set -eu
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA="\${XDG_DATA_HOME:-$HOME/.local/share}"
KIT_DIR="$DATA/kit/app"
APPS="$DATA/applications"
ICONS="$DATA/icons/hicolor"
BIN="$HOME/.local/bin"

# Replacing the files under a running Kit crashes it.
if pgrep -f "^$KIT_DIR/" >/dev/null 2>&1; then
  echo "Kit is running from $KIT_DIR. Close it and run this again." >&2
  exit 1
fi

if [ "\${1:-}" = "--uninstall" ]; then
  rm -rf "$KIT_DIR"
  rm -f "$APPS/kit.desktop" "$BIN/kit"
  for size in 16 32 48 64 128; do
    rm -f "$ICONS/\${size}x\${size}/apps/kit.png"
  done
  update-desktop-database "$APPS" 2>/dev/null || true
  echo "Removed Kit. Your profile is still in $DATA/kit/profile."
  exit 0
fi

# Copied next to the old app first, so a failed copy leaves it intact.
if [ "$SOURCE_DIR" != "$KIT_DIR" ]; then
  mkdir -p "$DATA/kit"
  rm -rf "$KIT_DIR.new"
  cp -a "$SOURCE_DIR" "$KIT_DIR.new"
  rm -rf "$KIT_DIR"
  mv "$KIT_DIR.new" "$KIT_DIR"
fi

mkdir -p "$APPS" "$BIN"
for size in 16 32 48 64 128; do
  mkdir -p "$ICONS/\${size}x\${size}/apps"
  cp "$KIT_DIR/icons/icon\${size}.png" "$ICONS/\${size}x\${size}/apps/kit.png"
done
# Quoted only when needed: some launchers keep Exec's quotes literally.
case "$KIT_DIR" in
  *" "*) KIT_EXEC="\"$KIT_DIR/kit\"" ;;
  *) KIT_EXEC="$KIT_DIR/kit" ;;
esac
sed "s|@KIT_EXEC@|$KIT_EXEC|g" "$KIT_DIR/kit.desktop.in" > "$APPS/kit.desktop"
ln -sf "$KIT_DIR/kit" "$BIN/kit"
update-desktop-database "$APPS" 2>/dev/null || true
gtk-update-icon-cache -q "$ICONS" 2>/dev/null || true
echo "Installed Kit to $KIT_DIR."
if [ "$SOURCE_DIR" != "$KIT_DIR" ]; then
  echo "You can delete $SOURCE_DIR."
fi

# xdg-mime rather than xdg-settings, which refuses whenever $BROWSER is set.
if [ "\${1:-}" = "--default" ]; then
  for type in x-scheme-handler/http x-scheme-handler/https text/html application/xhtml+xml; do
    xdg-mime default kit.desktop "$type"
  done
  echo "Kit is now the default browser."
  if [ -n "\${BROWSER:-}" ]; then
    echo "Note: \$BROWSER is set to $BROWSER; programs that read it still open that."
  fi
fi
`;

const DESKTOP_ENTRY = `[Desktop Entry]
Type=Application
Name=Kit
GenericName=Web Browser
Comment=Browse the web
Exec=@KIT_EXEC@ %u
Icon=kit
Terminal=false
StartupNotify=true
StartupWMClass=kit
Categories=Network;WebBrowser;
MimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;
Actions=new-window;new-private-window;

[Desktop Action new-window]
Name=New Window
Exec=@KIT_EXEC@ --new-window %u

[Desktop Action new-private-window]
Name=New Private Window
Exec=@KIT_EXEC@ --private-window %u
`;

function architecture(): string {
  return Deno.build.arch;
}

function copyTree(source: string, target: string): void {
  // -L: the build outputs may be symlinks; the package needs real files.
  const result = runCommandChecked("cp", ["-rL", source, target], undefined);
  if (!result.success) {
    throw new Error(`Copying ${source} failed: ${result.stderr}`);
  }
}

function writeExecutable(file: string, content: string): void {
  Deno.writeTextFileSync(file, content);
  Deno.chmodSync(file, 0o755);
}

// Kit's code as real files in <app>/noraneko, mounted from chrome.manifest.
function addKitCode(appDir: string): void {
  const kitDir = path.join(appDir, KIT_DIR_NAME);
  Deno.mkdirSync(kitDir, { recursive: true });
  createManifest("production", kitDir);
  for (const [mount, output] of MOUNTS) {
    const source = path.join(PROJECT_ROOT, output);
    if (!exists(source)) {
      throw new Error(`${output} is missing; did the production build run?`);
    }
    copyTree(source, path.join(kitDir, mount));
  }
  const manifestPath = path.join(appDir, "chrome.manifest");
  const manifest = exists(manifestPath) ? Deno.readTextFileSync(manifestPath) : "";
  if (!manifest.includes(KIT_MANIFEST_ENTRY)) {
    Deno.writeTextFileSync(manifestPath, `${manifest.trimEnd()}\n${KIT_MANIFEST_ENTRY}\n`);
  }
}

function addDesktopFiles(appDir: string): void {
  writeExecutable(path.join(appDir, "kit"), LAUNCHER);
  writeExecutable(path.join(appDir, "install.sh"), INSTALL_SCRIPT);
  Deno.writeTextFileSync(path.join(appDir, "kit.desktop.in"), DESKTOP_ENTRY);
  const icons = path.join(appDir, "icons");
  Deno.mkdirSync(icons, { recursive: true });
  const brandingDir = path.join(PROJECT_ROOT, "static", "gecko", "branding");
  for (const size of [16, 32, 48, 64, 128]) {
    Deno.copyFileSync(
      path.join(brandingDir, `icon${size}.png`),
      path.join(icons, `icon${size}.png`),
    );
  }
  const distribution = path.join(appDir, "distribution");
  Deno.mkdirSync(distribution, { recursive: true });
  Deno.writeTextFileSync(
    path.join(distribution, "policies.json"),
    `${JSON.stringify(POLICIES, null, 2)}\n`,
  );
}

function createTarball(stageDir: string, version: string): string {
  const tarball = path.join(
    PACKAGE_ROOT,
    `${APP_NAME}-${version}-linux-${architecture()}.tar.xz`,
  );
  if (exists(tarball)) {
    Deno.removeSync(tarball);
  }
  const result = runCommandChecked(
    "tar",
    ["-cJf", tarball, "-C", stageDir, APP_NAME],
    undefined,
  );
  if (!result.success) {
    throw new Error(`Creating ${tarball} failed: ${result.stderr}`);
  }
  return tarball;
}

export async function run(): Promise<void> {
  if (Deno.build.os !== "linux") {
    throw new Error("feles-build package only builds Linux packages so far.");
  }
  const version = Builder.packageVersion();
  const stageDir = path.join(PACKAGE_ROOT, "stage");
  const runtimeRoot = path.join(PACKAGE_ROOT, "runtime");
  const appDir = path.join(stageDir, APP_NAME);

  // 1. Kit's code, production build.
  await Builder.run("production", Update.generateUuidV7());

  // 2. The locked release runtime, reused between runs, then copied so
  //    patches always land on an untouched one.
  await installLockedRuntime({
    lock: await loadRuntimeLock(),
    binRootDir: runtimeRoot,
    profileDir: path.join(PACKAGE_ROOT, "scratch-profile"),
  });
  if (exists(stageDir)) {
    safeRemove(stageDir);
  }
  Deno.mkdirSync(stageDir, { recursive: true });
  copyTree(path.join(runtimeRoot, BRANDING.base_name), appDir);

  // 3. What dev builds do to _dist/bin, done to the copy.
  Patcher.applyAllPatchesTo(appDir);
  Pref.applyPrefs(appDir);
  Branding.run(appDir);
  await OnnxRuntime.run(appDir);
  addKitCode(appDir);
  await injectXhtmlFromTs({ binPath: appDir, allowBrowserHttpLoader: false });

  // 4. Launcher, desktop entry, tarball.
  addDesktopFiles(appDir);
  const tarball = createTarball(stageDir, version);
  logger.success(`Packaged Kit ${version}: ${tarball}`);
  logger.info(`Try it unpacked: ${path.join(appDir, APP_NAME)}`);
  logger.info(`Install: tar -xJf ${path.basename(tarball)} && ./kit/install.sh`);
}
