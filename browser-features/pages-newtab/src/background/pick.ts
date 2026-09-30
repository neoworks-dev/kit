// SPDX-License-Identifier: MPL-2.0

// Which photo a new tab shows, and the URL it's loaded from.
//
// By default every tab shows the day's photo. A new photo per tab sounds
// livelier, but tabs are opened constantly and a background that changes each
// time reads as flicker and costs a half-megabyte download per tab; one photo
// a day is downloaded once, then comes from the cache. The `shuffle` setting
// is there for people who want the variety anyway.

import type { Photo } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

// Days since the epoch in local time, so the photo changes at local midnight.
export function localDay(date: Date): number {
  return Math.floor(
    (date.getTime() - date.getTimezoneOffset() * 60_000) / DAY_MS,
  );
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// Steps through the list with a stride coprime to its length, so consecutive
// days land on unrelated photos and every photo comes up once per cycle.
function stride(length: number): number {
  let step = 7;
  while (length > 1 && gcd(step, length) !== 1) step++;
  return step;
}

export function photoForDay<T>(photos: readonly T[], day: number): T {
  const length = photos.length;
  const index = ((day * stride(length)) % length + length) % length;
  return photos[index];
}

// Any photo but `exclude`, so a shuffled tab visibly differs from the last.
export function randomPhoto<T>(
  photos: readonly T[],
  exclude?: T,
  random: () => number = Math.random,
): T {
  const pool = photos.length > 1
    ? photos.filter((p) => p !== exclude)
    : photos;
  return pool[Math.floor(random() * pool.length)];
}

// Widths the CDN is asked for. Rounding the screen up to one of a few sizes
// keeps the URL, and so the cache entry, the same across tabs and windows.
const WIDTHS = [1280, 1920, 2560] as const;

export function photoWidth(screenWidth: number, pixelRatio: number): number {
  const needed = screenWidth * pixelRatio;
  return WIDTHS.find((w) => w >= needed) ?? WIDTHS[WIDTHS.length - 1];
}

export function photoUrl(photo: Photo, width: number): string {
  return `https://images.unsplash.com/photo-${photo.id}?auto=format&fit=crop&w=${width}&q=80`;
}

// Unsplash asks for referral parameters on links back to it.
export function unsplashLink(url: string): string {
  const link = new URL(url);
  link.searchParams.set("utm_source", "kit");
  link.searchParams.set("utm_medium", "referral");
  return link.href;
}
