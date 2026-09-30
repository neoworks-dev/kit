// SPDX-License-Identifier: MPL-2.0

import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  Show,
} from "solid-js";
import { PHOTOS } from "./photos.ts";
import {
  localDay,
  photoForDay,
  photoUrl,
  photoWidth,
  randomPhoto,
  unsplashLink,
} from "./pick.ts";
import type { BackgroundSettings, Photo } from "./types.ts";

interface LoadedPhoto {
  photo: Photo;
  url: string;
}

// Decodes before resolving, so the photo is ready to paint when it fades in
// rather than appearing in stripes.
async function loadImage(url: string): Promise<void> {
  const image = new Image();
  image.src = url;
  await image.decode();
}

// Tomorrow's photo goes into the HTTP cache once the page is idle, so the
// first new tab of the day doesn't wait for the network.
function preloadTomorrow(width: number): void {
  const tomorrow = photoForDay(PHOTOS, localDay(new Date()) + 1);
  const run = () => {
    const image = new Image();
    image.fetchPriority = "low";
    image.src = photoUrl(tomorrow, width);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 10_000 });
  } else {
    setTimeout(run, 2000);
  }
}

// Full-bleed photo behind the page. Until the photo has loaded, and whenever
// it can't (offline, blocked), the page keeps its flat background, so there's
// never a blank or broken image. While a photo shows, :root gets
// data-backdrop="photo", which turns the surface tokens translucent
// (globals.css).
export function Backdrop(props: { settings: Accessor<BackgroundSettings> }) {
  const width = photoWidth(screen.width, devicePixelRatio);
  const [loaded, setLoaded] = createSignal<LoadedPhoto | null>(null);

  let previous: Photo | undefined;
  const photo = createMemo(
    on(
      () => [props.settings().enabled, props.settings().shuffle] as const,
      ([enabled, shuffle]) => {
        if (!enabled) return null;
        previous = shuffle
          ? randomPhoto(PHOTOS, previous)
          : photoForDay(PHOTOS, localDay(new Date()));
        return previous;
      },
    ),
  );

  createEffect(() => {
    const next = photo();
    if (!next) {
      setLoaded(null);
      return;
    }
    const url = photoUrl(next, width);
    // A newer choice may land first; only the latest one is shown.
    let current = true;
    onCleanup(() => {
      current = false;
    });
    loadImage(url).then(
      () => {
        if (!current) return;
        setLoaded({ photo: next, url });
        if (!props.settings().shuffle) preloadTomorrow(width);
      },
      (e: unknown) => {
        if (!current) return;
        console.error("[NewTab] Failed to load background photo:", url, e);
        setLoaded(null);
      },
    );
  });

  createEffect(() => {
    const root = document.documentElement;
    if (loaded()) root.dataset.backdrop = "photo";
    else delete root.dataset.backdrop;
  });
  onCleanup(() => {
    delete document.documentElement.dataset.backdrop;
  });

  return (
    <>
      <div
        aria-hidden="true"
        class="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center transition-opacity duration-700 ease-out motion-reduce:transition-none"
        style={{
          "background-image": loaded() ? `url("${loaded()!.url}")` : undefined,
          opacity: loaded() ? "1" : "0",
        }}
      >
        {/* Darkest at the bottom, where the credit and Customize sit on the
            bare photo; lighter in the middle, where widgets bring their own
            surfaces. */}
        <div class="nw-scrim absolute inset-0" />
      </div>
      <Show when={loaded()}>
        {(current) => (
          <p class="fixed bottom-6 left-5 text-xs text-dim">
            Photo by{" "}
            <a
              href={unsplashLink(current().photo.page)}
              class="text-muted transition-colors duration-120 hover:text-default"
            >
              {current().photo.photographer}
            </a>{" "}
            on{" "}
            <a
              href={unsplashLink("https://unsplash.com/")}
              class="text-muted transition-colors duration-120 hover:text-default"
            >
              Unsplash
            </a>
          </p>
        )}
      </Show>
    </>
  );
}
