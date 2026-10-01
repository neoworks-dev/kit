// SPDX-License-Identifier: MPL-2.0

import { For, Match, Show, Switch } from "solid-js";
import {
  chooseProfile,
  chooseSource,
  IMPORT_TYPE_LABELS,
  phase,
  profileId,
  resultFor,
  selectedProfile,
  selectedTypes,
  sortedTypes,
  sourceKey,
  sources,
  toggleType,
} from "./browser-import.ts";
import { attributeFlag } from "./controls.tsx";
import type { ImportResult, ImportSource, ImportType } from "./types.ts";

function SourceRow(props: { source: ImportSource }) {
  const selected = () => props.source.key === sourceKey();
  return (
    <div class="nw-onboarding-source" data-selected={attributeFlag(selected())}>
      <button
        type="button"
        role="radio"
        class="nw-onboarding-source-button"
        aria-checked={selected() ? "true" : "false"}
        onClick={() => chooseSource(props.source)}
      >
        <span class="nw-onboarding-radio" />
        <span class="nw-onboarding-source-name">{props.source.name}</span>
      </button>
      {/* Profiles only matter once the browser is picked. */}
      <Show when={selected() && props.source.profiles.length > 1}>
        <div class="nw-onboarding-profiles">
          <For each={props.source.profiles}>
            {(profile) => (
              <button
                type="button"
                class="nw-onboarding-chip"
                data-selected={attributeFlag(profile.id === profileId())}
                onClick={() => chooseProfile(props.source, profile)}
              >
                {profile.name}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function TypeCheckbox(props: { type: ImportType }) {
  const checked = () => selectedTypes().includes(props.type);
  return (
    <button
      type="button"
      role="checkbox"
      class="nw-onboarding-check"
      aria-checked={checked() ? "true" : "false"}
      data-checked={attributeFlag(checked())}
      onClick={() => toggleType(props.type)}
    >
      <span class="nw-onboarding-checkbox">
        <span class="nw-icon" data-icon="check" />
      </span>
      {IMPORT_TYPE_LABELS[props.type]}
    </button>
  );
}

function resultText(result: ImportResult): string {
  if (!result.ok) {
    return result.error || "Failed";
  }
  if (result.count === undefined) {
    return "Done";
  }
  return `${result.count} imported`;
}

function resultIcon(result: ImportResult | undefined): string {
  if (!result) {
    return "dots-three";
  }
  return result.ok ? "check" : "x";
}

function ProgressRow(props: { type: ImportType }) {
  const result = () => resultFor(props.type);
  return (
    <div
      class="nw-onboarding-progress"
      data-state={result() ? (result()?.ok ? "ok" : "failed") : "pending"}
    >
      <span class="nw-icon" data-icon={resultIcon(result())} />
      <span class="nw-onboarding-progress-type">{IMPORT_TYPE_LABELS[props.type]}</span>
      <span class="nw-onboarding-progress-status">
        {result() ? resultText(result() as ImportResult) : "Importing…"}
      </span>
    </div>
  );
}

function Chooser() {
  return (
    <>
      <div class="nw-onboarding-section">Import from</div>
      <div class="nw-onboarding-sources" role="radiogroup">
        <For each={sources()}>{(source) => <SourceRow source={source} />}</For>
      </div>
      <Show when={selectedProfile()}>
        {(profile) => (
          <>
            <div class="nw-onboarding-section">What to bring</div>
            <div class="nw-onboarding-checks">
              <For each={sortedTypes(profile().types)}>
                {(type) => <TypeCheckbox type={type} />}
              </For>
            </div>
          </>
        )}
      </Show>
    </>
  );
}

export function ImportStep() {
  return (
    <>
      <h1 class="nw-onboarding-title">Bring your browser along</h1>
      <p class="nw-onboarding-lead">
        Import tabs, bookmarks and more from a browser you already use.
      </p>
      <Switch>
        <Match when={phase() === "detecting"}>
          <p class="nw-onboarding-note">Looking for other browsers…</p>
        </Match>
        <Match when={phase() === "choosing" && sources().length === 0}>
          <p class="nw-onboarding-note">No other browsers found on this computer.</p>
        </Match>
        <Match when={phase() === "choosing"}>
          <Chooser />
        </Match>
        <Match when={phase() === "importing" || phase() === "finished"}>
          <div class="nw-onboarding-section">
            {phase() === "finished" ? "Imported" : "Importing"}
          </div>
          <div class="nw-onboarding-progress-list">
            <For each={selectedTypes()}>{(type) => <ProgressRow type={type} />}</For>
          </div>
        </Match>
      </Switch>
    </>
  );
}
