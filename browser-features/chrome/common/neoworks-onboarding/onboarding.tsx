// SPDX-License-Identifier: MPL-2.0

import { createEffect, For, Match, onCleanup, Show, Switch } from "solid-js";
import { createPageBackdrop } from "../neoworks-ui/page-backdrop.ts";
import { phase, runImport, selectedTypes, sources } from "./browser-import.ts";
import { attributeFlag } from "./controls.tsx";
import { ImportStep } from "./import-step.tsx";
import { closeOnboarding, goBy, isOpen, PANEL_ID, step, STEPS } from "./onboarding.ts";
import { DoneStep, SettingsStep, ThemeStep, WelcomeStep } from "./steps.tsx";
import glassStyle from "../neoworks-ui/glass.css?inline";
import iconStyle from "../neoworks-ui/icons.css?inline";
import onboardingStyle from "./onboarding.css?inline";

const BACKDROP_ID = "neoworks-onboarding-backdrop";

function StepDots() {
  return (
    <div class="nw-onboarding-dots" aria-hidden="true">
      <For each={STEPS}>
        {(dot) => <span class="nw-onboarding-dot" data-current={attributeFlag(dot === step())} />}
      </For>
    </div>
  );
}

function PrimaryButton(props: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class="nw-onboarding-button"
      data-primary="true"
      data-autofocus="true"
      disabled={props.disabled || undefined}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

function SecondaryButton(props: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" class="nw-onboarding-button" disabled={props.disabled || undefined} onClick={props.onClick}>
      {props.label}
    </button>
  );
}

// Import can be picked (Import), running (disabled) or over (Continue).
function ImportActions() {
  const canImport = () => phase() === "choosing" && sources().length > 0 && selectedTypes().length > 0;
  return (
    <Switch>
      <Match when={phase() === "importing"}>
        <PrimaryButton label="Importing…" disabled onClick={() => {}} />
      </Match>
      <Match when={phase() === "choosing" && sources().length > 0}>
        <SecondaryButton label="Skip" onClick={() => goBy(1)} />
        <PrimaryButton label="Import" disabled={!canImport()} onClick={runImport} />
      </Match>
      <Match when>
        <PrimaryButton label="Continue" disabled={phase() === "detecting"} onClick={() => goBy(1)} />
      </Match>
    </Switch>
  );
}

function Footer() {
  return (
    <div class="nw-onboarding-footer">
      <Switch>
        <Match when={step() === "welcome"}>
          <SecondaryButton label="Skip setup" onClick={closeOnboarding} />
        </Match>
        <Match when={step() !== "done"}>
          <SecondaryButton label="Back" disabled={phase() === "importing"} onClick={() => goBy(-1)} />
        </Match>
      </Switch>
      <span class="nw-onboarding-footer-gap" />
      <Switch>
        <Match when={step() === "welcome"}>
          <PrimaryButton label="Get started" onClick={() => goBy(1)} />
        </Match>
        <Match when={step() === "import"}>
          <ImportActions />
        </Match>
        <Match when={step() === "done"}>
          <PrimaryButton label="Start browsing" onClick={closeOnboarding} />
        </Match>
        <Match when>
          <PrimaryButton label="Continue" onClick={() => goBy(1)} />
        </Match>
      </Switch>
    </div>
  );
}

// Escape leaves the setup, keeping what was chosen so far, except mid-import.
function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape" && phase() !== "importing") {
    event.preventDefault();
    closeOnboarding();
  }
}

export function Onboarding() {
  const backdrop = createPageBackdrop(PANEL_ID, BACKDROP_ID);
  createEffect(() => {
    if (isOpen()) {
      backdrop.start();
      return;
    }
    backdrop.stop();
  });
  onCleanup(() => backdrop.stop());

  return (
    <div
      id="neoworks-onboarding"
      data-open={attributeFlag(isOpen())}
      data-nw-keys-off="true"
      onKeyDown={handleKeyDown}
    >
      <style>{glassStyle + iconStyle + onboardingStyle}</style>
      <Show when={isOpen()}>
        <div
          id={PANEL_ID}
          class="nw-onboarding-panel nw-glass"
          role="dialog"
          aria-modal="true"
          aria-label="Set up Kit"
          data-step={step()}
        >
          <canvas id={BACKDROP_ID} class="nw-glass-backdrop" />
          <StepDots />
          <div class="nw-onboarding-body">
            <Switch>
              <Match when={step() === "welcome"}>
                <WelcomeStep />
              </Match>
              <Match when={step() === "import"}>
                <ImportStep />
              </Match>
              <Match when={step() === "theme"}>
                <ThemeStep />
              </Match>
              <Match when={step() === "settings"}>
                <SettingsStep />
              </Match>
              <Match when={step() === "done"}>
                <DoneStep />
              </Match>
            </Switch>
          </div>
          <Footer />
        </div>
      </Show>
    </div>
  );
}
