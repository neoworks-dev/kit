// SPDX-License-Identifier: MPL-2.0

import { For, Match, onMount, Switch } from "solid-js";
import { NW_COMMAND_TITLES, type NWCommandId, summarizeBindings } from "#features-modules/common/NWKeymap.ts";
import { attributeFlag, Segmented, SettingRow, Toggle } from "./controls.tsx";
import {
  ARCHIVE_AFTER_OPTIONS,
  archiveAfterHours,
  docked,
  GLASS_TINT_OPTIONS,
  glassTint,
  setArchiveAfterHours,
  setDocked,
  setGlassTint,
  setTransparent,
  transparent,
} from "./settings.ts";
import { checkDefaultBrowser, defaultBrowserState, makeDefaultBrowser } from "./default-browser.ts";
import { activeThemeId, applyTheme, THEME_CHOICES } from "./themes.ts";
import type { ThemeChoice } from "./types.ts";

function DefaultBrowserControl() {
  return (
    <Switch>
      <Match when={defaultBrowserState() === "default"}>
        <span class="nw-onboarding-status" data-ok="true">
          <span class="nw-icon" data-icon="check" />
          Default
        </span>
      </Match>
      <Match when={defaultBrowserState() === "failed"}>
        <span class="nw-onboarding-status">Set it in your system settings</span>
      </Match>
      <Match when={true}>
        <button
          type="button"
          class="nw-onboarding-button nw-onboarding-default-button"
          disabled={defaultBrowserState() === "setting" ? true : undefined}
          onClick={() => void makeDefaultBrowser()}
        >
          Make default
        </button>
      </Match>
    </Switch>
  );
}

export function WelcomeStep() {
  onMount(checkDefaultBrowser);
  return (
    <div class="nw-onboarding-welcome">
      <img class="nw-onboarding-logo" src="chrome://branding/content/about-logo.svg" alt="" />
      <h1 class="nw-onboarding-title">Welcome to Kit</h1>
      <p class="nw-onboarding-lead">
        A few choices to make Kit yours. You can change all of them later in Settings.
      </p>
      <SettingRow
        title="Default browser"
        description="Open links from other apps in Kit."
      >
        <DefaultBrowserControl />
      </SettingRow>
    </div>
  );
}

// A tiny window: frame, sidebar and page.
function MiniWindow(props: { scheme: "light" | "dark" }) {
  return (
    <span class="nw-onboarding-theme-window" data-scheme={props.scheme}>
      <span class="nw-onboarding-theme-sidebar" />
      <span class="nw-onboarding-theme-page" />
    </span>
  );
}

function ThemeCard(props: { theme: ThemeChoice }) {
  const selected = () => activeThemeId() === props.theme.id;
  return (
    <button
      type="button"
      role="radio"
      class="nw-onboarding-theme"
      aria-checked={selected() ? "true" : "false"}
      data-selected={attributeFlag(selected())}
      onClick={() => applyTheme(props.theme.id)}
    >
      <span class="nw-onboarding-theme-preview">
        <For each={props.theme.schemes}>{(scheme) => <MiniWindow scheme={scheme} />}</For>
      </span>
      <span class="nw-onboarding-theme-label">{props.theme.label}</span>
      <span class="nw-onboarding-theme-description">{props.theme.description}</span>
    </button>
  );
}

export function ThemeStep() {
  return (
    <>
      <h1 class="nw-onboarding-title">Pick a look</h1>
      <p class="nw-onboarding-lead">Add-on themes from addons.mozilla.org work too.</p>
      <div class="nw-onboarding-themes" role="radiogroup" aria-label="Theme">
        <For each={THEME_CHOICES}>{(theme) => <ThemeCard theme={theme} />}</For>
      </div>
      <SettingRow title="Glass tint" description="How strongly the sidebar, spotlight and menus are tinted over the page.">
        <Segmented label="Glass tint" options={GLASS_TINT_OPTIONS} value={glassTint()} onChange={setGlassTint} />
      </SettingRow>
      <SettingRow title="Transparent window" description="Let the desktop show through the window frame.">
        <Toggle label="Transparent window" checked={transparent()} onChange={setTransparent} />
      </SettingRow>
    </>
  );
}

export function SettingsStep() {
  return (
    <>
      <h1 class="nw-onboarding-title">Tabs and sidebar</h1>
      <p class="nw-onboarding-lead">Kit keeps your tabs in a sidebar, grouped into workspaces.</p>
      <SettingRow
        title="Dock the sidebar"
        description="Keep the sidebar beside the page. Off, it slides in over the page when you need it."
      >
        <Toggle label="Dock the sidebar" checked={docked()} onChange={setDocked} />
      </SettingRow>
      <SettingRow
        title="Archive unused tabs"
        stacked
        description="Close tabs you haven't used for a while. The spotlight still finds them. Pinned tabs are never archived."
      >
        <Segmented
          label="Archive unused tabs after"
          options={ARCHIVE_AFTER_OPTIONS}
          value={archiveAfterHours()}
          onChange={setArchiveAfterHours}
        />
      </SettingRow>
    </>
  );
}

// Key sequences worth knowing on day one, as the settings page lists them.
const TIP_COMMANDS: NWCommandId[] = ["spotlight:open", "hints:open", "workspace:next", "split:vertical"];

function tipKeys(command: NWCommandId): string[] {
  return summarizeBindings().find((summary) => summary.command === command)?.keys ?? [];
}

export function DoneStep() {
  return (
    <>
      <h1 class="nw-onboarding-title">You're all set</h1>
      <p class="nw-onboarding-lead">
        Kit runs on the keyboard. A few keys to start with, typed anywhere outside a text field:
      </p>
      <div class="nw-onboarding-tips">
        <For each={TIP_COMMANDS}>
          {(command) => (
            <div class="nw-onboarding-tip">
              <span>{NW_COMMAND_TITLES[command]}</span>
              <span class="nw-onboarding-keys">
                <For each={tipKeys(command)}>{(keys) => <kbd class="nw-onboarding-key">{keys}</kbd>}</For>
              </span>
            </div>
          )}
        </For>
      </div>
      <p class="nw-onboarding-note">
        All shortcuts are listed in Settings. Run this setup again from the spotlight.
      </p>
    </>
  );
}
