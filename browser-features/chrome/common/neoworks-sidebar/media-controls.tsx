// SPDX-License-Identifier: MPL-2.0

// Player card above the sidebar footer while a tab you're not on has media:
// the tab's favicon, previous / play-pause / next, and mute. Hovering
// unfolds the title; clicking the card (outside the buttons) goes to the tab.

import pauseIcon from "@phosphor-icons/core/fill/pause-fill.svg?raw";
import playIcon from "@phosphor-icons/core/fill/play-fill.svg?raw";
import skipBackIcon from "@phosphor-icons/core/fill/skip-back-fill.svg?raw";
import skipForwardIcon from "@phosphor-icons/core/fill/skip-forward-fill.svg?raw";
import speakerHighIcon from "@phosphor-icons/core/fill/speaker-high-fill.svg?raw";
import speakerSlashIcon from "@phosphor-icons/core/fill/speaker-slash-fill.svg?raw";
import { Show } from "solid-js";
import { phosphorMask } from "../neoworks-ui/phosphor.ts";
import { createMediaSession } from "./media-session.ts";
import { selectTab } from "./tab-actions.ts";
import { Favicon, tabReader } from "./tab-row.tsx";
import type { MediaSession, TabState } from "./types.ts";

function ControlButton(props: {
  icon: string;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class="nw-icon-button nw-media-button"
      title={props.title}
      disabled={props.disabled}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        props.onClick();
      }}
    >
      <span class="nw-icon" style={{ "mask-image": phosphorMask(props.icon) }} />
    </button>
  );
}

// Sites without track controls (most videos) still get disabled buttons, so
// the card keeps its layout.
function supports(session: MediaSession, key: MediaControlKey): boolean {
  return session.controller.supportedKeys.includes(key);
}

// What the site reports through the Media Session API, else the tab title.
// Throws once the controller goes inactive, just before the card hides.
function metadataOf(session: MediaSession): MediaMetadataInit {
  try {
    return session.controller.getMetadata();
  } catch {
    return {};
  }
}

function togglePlaying(session: MediaSession): void {
  if (session.controller.isPlaying) {
    session.controller.pause();
    return;
  }
  session.controller.play();
}

function MediaCard(props: { session: MediaSession; tabState: TabState }) {
  const read = tabReader(props.tabState);
  const tab = () => props.session.tab;
  const label = read(() => tab().label);
  const favicon = read(() => tab().image);
  const muted = read(() => tab().muted);
  const metadata = () => metadataOf(props.session);
  const title = () => metadata().title || label();

  return (
    <div class="nw-media" onClick={() => selectTab(tab())}>
      <div class="nw-media-info">
        <div class="nw-media-info-inner">
          <span class="nw-media-title">{title()}</span>
          <Show when={metadata().artist}>
            {(artist) => <span class="nw-media-artist">{artist()}</span>}
          </Show>
        </div>
      </div>
      <div class="nw-media-controls">
        <span class="nw-media-tab">
          <Favicon source={favicon()} busy={false} />
        </span>
        <ControlButton
          icon={skipBackIcon}
          title="Previous track"
          disabled={!supports(props.session, "previoustrack")}
          onClick={() => props.session.controller.prevTrack()}
        />
        <ControlButton
          icon={props.session.controller.isPlaying ? pauseIcon : playIcon}
          title={props.session.controller.isPlaying ? "Pause" : "Play"}
          onClick={() => togglePlaying(props.session)}
        />
        <ControlButton
          icon={skipForwardIcon}
          title="Next track"
          disabled={!supports(props.session, "nexttrack")}
          onClick={() => props.session.controller.nextTrack()}
        />
        <ControlButton
          icon={muted() ? speakerSlashIcon : speakerHighIcon}
          title={muted() ? "Unmute" : "Mute"}
          onClick={() => tab().toggleMuteAudio()}
        />
      </div>
    </div>
  );
}

export function MediaControls(props: { tabState: TabState }) {
  const session = createMediaSession(props.tabState);
  // The page itself has the controls while you're on it.
  const elsewhere = () => {
    const current = session();
    if (!current || current.tab.selected) {
      return null;
    }
    return current;
  };
  return (
    <Show when={elsewhere()}>
      {(current) => <MediaCard session={current()} tabState={props.tabState} />}
    </Show>
  );
}
