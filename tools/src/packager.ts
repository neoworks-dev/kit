// SPDX-License-Identifier: MPL-2.0

// `feles-build package`: a standalone Kit for Linux, as a tarball. It takes
// the locked release runtime (not the debug one development uses), applies
// Kit's patches, prefs and branding to it like a dev build does, and puts the
// production build of Kit's own code next to it as real files. The runtime's
// binary is `kit` (initializer.adoptRuntimeLayout); a `kit-launcher` script
// keeps Kit's profile apart from any Floorp install and an
// install.sh copies Kit to ~/.local/share/kit/app and registers it with the
// desktop, so it can be the default browser. kit-update, run by the launcher,
// keeps an installed Kit up to date from the GitHub releases.
//
// The result runs without the dev servers: the production startup script
// loads chrome://noraneko/ (bridge/startup/src/chrome_root.ts).

import * as path from "@std/path";
import * as Branding from "../../static/gecko/branding/branding.ts";
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
const LAUNCHER_NAME = "kit-launcher";
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

// The runtime's own updater stays off (its update URL is a placeholder); Kit
// updates through kit-update instead.
const POLICIES = { policies: { DisableAppUpdate: true } };

const UPDATER_NAME = "kit-update";
// Where releases are published (.github/workflows/release.yml).
const RELEASE_REPOSITORY = "neoworks-dev/kit";

const LAUNCHER = `#!/bin/sh
# Starts Kit with its own profile, so it never shares one with Floorp.
# MOZ_APP_LAUNCHER makes "Make default" register this script rather than the
# bare binary, which would open Floorp's default profile.
# An installed Kit first installs an update downloaded on an earlier start,
# then looks for the next one in the background (${UPDATER_NAME}).
KIT_DIR="$(dirname "$(readlink -f "$0")")"
DATA="\${XDG_DATA_HOME:-$HOME/.local/share}"
PROFILE="\${KIT_PROFILE:-$DATA/kit/profile}"
mkdir -p "$PROFILE"
if [ "$KIT_DIR" = "$DATA/kit/app" ] && [ -z "\${KIT_NO_UPDATE:-}" ] &&
  ! pgrep -f "^$KIT_DIR/${APP_NAME}( |$)" >/dev/null 2>&1; then
  # Exit status 10: a new Kit replaced this one; start that instead.
  "$KIT_DIR/${UPDATER_NAME}" apply
  if [ $? -eq 10 ]; then
    exec "$KIT_DIR/${LAUNCHER_NAME}" "$@"
  fi
  ("$KIT_DIR/${UPDATER_NAME}" check >/dev/null 2>&1 &)
fi
export MOZ_APP_LAUNCHER="$KIT_DIR/${LAUNCHER_NAME}"
exec "$KIT_DIR/${APP_NAME}" --profile "$PROFILE" --name kit --class kit "$@"
`;

const UPDATER = `#!/bin/sh
# Updates an installed Kit from its GitHub releases. kit-launcher runs it on
# every start:
#   ${UPDATER_NAME} apply   installs the update an earlier check downloaded;
#                    exits with 10 when it did. Only while Kit isn't running.
#   ${UPDATER_NAME} check   downloads a newer release, if there is one, for the
#                    next start: checked against its .sha256 and unpacked.
# What happens is logged to ~/.local/share/kit/update/update.log.
set -u
REPO="${RELEASE_REPOSITORY}"
KIT_DIR="$(dirname "$(readlink -f "$0")")"
DATA="\${XDG_DATA_HOME:-$HOME/.local/share}"
UPDATE_DIR="$DATA/kit/update"
READY="$UPDATE_DIR/ready"
DOWNLOAD="$UPDATE_DIR/download"
LOCK="$UPDATE_DIR/lock"
LOG="$UPDATE_DIR/update.log"
VERSION="$(cat "$KIT_DIR/version.txt" 2>/dev/null || echo 0)"
ARCH="$(uname -m)"

log() {
  mkdir -p "$UPDATE_DIR"
  printf '%s %s\\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"
}

# Whether version $1 is newer than $2.
newer() {
  [ "$1" != "$2" ] && [ "$(printf '%s\\n%s\\n' "$1" "$2" | sort -V | tail -n 1)" = "$1" ]
}

apply() {
  [ -f "$READY/kit/install.sh" ] || return 0
  if pgrep -f "^$KIT_DIR/${APP_NAME}( |$)" >/dev/null 2>&1; then
    return 0
  fi
  ready="$(cat "$READY/kit/version.txt" 2>/dev/null || echo 0)"
  if ! newer "$ready" "$VERSION"; then
    rm -rf "$READY"
    return 0
  fi
  if sh "$READY/kit/install.sh" >> "$LOG" 2>&1; then
    log "Installed Kit $ready (was $VERSION)."
    rm -rf "$READY"
    return 10
  fi
  log "Installing Kit $ready failed; Kit $VERSION stays."
  rm -rf "$READY"
  return 0
}

check() {
  if ! command -v curl >/dev/null 2>&1; then
    log "curl is missing, so updates can't be checked."
    return 0
  fi
  mkdir -p "$UPDATE_DIR"
  # A check that died long ago leaves its lock behind.
  find "$LOCK" -maxdepth 0 -mmin +60 -exec rm -rf {} + 2>/dev/null
  mkdir "$LOCK" 2>/dev/null || return 0
  trap 'rm -rf "$LOCK" "$DOWNLOAD"' EXIT

  # .../releases/latest redirects to .../releases/tag/v<version>.
  url="$(curl -fsSI -o /dev/null -w '%{redirect_url}' --max-time 20 \\
    "https://github.com/$REPO/releases/latest")" || return 0
  case "$url" in
    */tag/*) latest="\${url##*/tag/}" ;;
    *) return 0 ;;
  esac
  latest="\${latest#v}"
  newer "$latest" "$VERSION" || return 0
  if [ "$(cat "$READY/kit/version.txt" 2>/dev/null)" = "$latest" ]; then
    return 0
  fi

  name="kit-$latest-linux-$ARCH.tar.xz"
  base="https://github.com/$REPO/releases/download/v$latest"
  rm -rf "$DOWNLOAD"
  mkdir -p "$DOWNLOAD/unpacked"
  if ! curl -fsSL --max-time 900 -o "$DOWNLOAD/$name" "$base/$name" ||
    ! curl -fsSL --max-time 20 -o "$DOWNLOAD/$name.sha256" "$base/$name.sha256"; then
    log "Downloading Kit $latest failed."
    return 0
  fi
  if ! (cd "$DOWNLOAD" && sha256sum -c "$name.sha256" >/dev/null 2>&1); then
    log "Kit $latest doesn't match its checksum; not installing it."
    return 0
  fi
  if ! tar -xJf "$DOWNLOAD/$name" -C "$DOWNLOAD/unpacked" ||
    [ ! -f "$DOWNLOAD/unpacked/kit/install.sh" ]; then
    log "Unpacking Kit $latest failed."
    return 0
  fi
  rm -rf "$READY"
  mv "$DOWNLOAD/unpacked" "$READY"
  log "Downloaded Kit $latest; it installs on the next start."
}

case "\${1:-}" in
  apply) apply ;;
  check) check ;;
  *)
    echo "Usage: ${UPDATER_NAME} apply|check" >&2
    exit 2
    ;;
esac
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
  *" "*) KIT_EXEC="\"$KIT_DIR/${LAUNCHER_NAME}\"" ;;
  *) KIT_EXEC="$KIT_DIR/${LAUNCHER_NAME}" ;;
esac
sed "s|@KIT_EXEC@|$KIT_EXEC|g" "$KIT_DIR/kit.desktop.in" > "$APPS/kit.desktop"
ln -sf "$KIT_DIR/${LAUNCHER_NAME}" "$BIN/kit"
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

function addDesktopFiles(appDir: string, version: string): void {
  writeExecutable(path.join(appDir, LAUNCHER_NAME), LAUNCHER);
  writeExecutable(path.join(appDir, UPDATER_NAME), UPDATER);
  writeExecutable(path.join(appDir, "install.sh"), INSTALL_SCRIPT);
  // What kit-update compares releases against.
  Deno.writeTextFileSync(path.join(appDir, "version.txt"), `${version}\n`);
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
  addKitCode(appDir);
  await injectXhtmlFromTs({ binPath: appDir, allowBrowserHttpLoader: false });

  // 4. Launcher, desktop entry, tarball.
  addDesktopFiles(appDir, version);
  const tarball = createTarball(stageDir, version);
  logger.success(`Packaged Kit ${version}: ${tarball}`);
  logger.info(`Try it unpacked: ${path.join(appDir, LAUNCHER_NAME)}`);
  logger.info(`Install: tar -xJf ${path.basename(tarball)} && ./kit/install.sh`);
}
