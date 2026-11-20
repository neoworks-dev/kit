# Marmot images: what's in place, what's missing

Firefox's mascot is a fox (Mozilla calls it "Kit", so most of its files are
named `kit-*.svg` — unrelated to our name). `marmot.ts` replaces fox
illustrations in the runtime with Neoworks' marmot on every build. The poses in
`marmot/` come from `neoworks.dev/apps/web/static/marmot/` (flat cartoon,
brown/yellow marmot, dark outline, transparent background, ~400 px tall webp).
Nobody has a vector marmot yet, so every replacement is an SVG wrapping the webp
at the original's size and viewBox.

All new marmots should match that style: transparent background, the soft ground
shadow under the feet is fine for illustrations, no shadow for icons.

## In place

| Runtime file                                                                        | Shows in                                    | Pose (`marmot/`)  | Source in neoworks.dev                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------- | ----------------- | -------------------------------------- |
| `chrome/toolkit/skin/classic/global/illustrations/no-connection.svg`                | about:neterror (server not found, offline)  | `lost`            | `marmot/sheets/states.png`, cell 1     |
| `…/illustrations/security-error.svg`                                                | about:certerror, other security errors      | `warning-sign`    | `marmot/callouts/warning-1.webp`       |
| `…/illustrations/kit-happy.svg`                                                     | about:preferences, "Kit is your default"    | `celebrating`     | `marmot/sheets/states.png`, cell 3     |
| `…/illustrations/kit-concerned.svg`                                                 | about:preferences, "Kit isn't your default" | `pondering`       | `marmot/callouts/tip-3.webp`           |
| `…/illustrations/kit-confetti.svg`                                                  | about:preferences, browser icon setting     | `celebrating`     | `marmot/sheets/states.png`, cell 3     |
| `…/illustrations/kit-holding-lock.svg`                                              | about:preferences, browser icon setting     | `guard`           | `marmot/guard.webp`                    |
| `…/illustrations/kit-sympathetic.svg`                                               | about:restartrequired                       | `hand-up`         | `marmot/callouts/warning-2.webp`       |
| `chrome/toolkit/skin/classic/mozapps/extensions/kit-addons.svg`                     | about:addons, footer / empty list           | `puzzle`          | `marmot/sheets/developers.png`, cell 6 |
| `…/mozapps/extensions/kit-themes.svg`                                               | about:addons, themes footer                 | `painter`         | `marmot/apps/painter.webp`             |
| `browser/…/skin/classic/browser/addons/extensions-panel-empty.svg`                  | extensions panel, nothing installed         | `puzzle`          | `marmot/sheets/developers.png`, cell 6 |
| `browser/…/addons/extensions-panel-empty-onboarding.svg`                            | extensions panel, first run                 | `puzzle`          | `marmot/sheets/developers.png`, cell 6 |
| `chrome/toolkit/content/global/megalist/icons/cpm-fox-illustration.svg`             | about:logins, passwords sidebar             | `chest`           | `marmot/chest.webp`                    |
| `browser/…/skin/classic/browser/sidebar/kit-page-history.svg`                       | Firefox history sidebar / View, empty       | `filing`          | `marmot/filing.webp`                   |
| `browser/…/content/browser/firefoxview/history-empty.svg`                           | Firefox View history, empty                 | `filing`          | `marmot/filing.webp`                   |
| `browser/…/sidebar/kit-tabs-devices.svg`, `kit-qr-tabs-devices-empty.svg`           | synced tabs, sign in / no devices           | `syncing`         | `marmot/apps/syncing.webp`             |
| `browser/…/firefoxview/synced-tabs-empty.svg`                                       | Firefox View synced tabs, empty             | `syncing`         | `marmot/apps/syncing.webp`             |
| `browser/…/sidebar/kit-tabs-devices-error.svg`, `firefoxview/synced-tabs-error.svg` | synced tabs, error                          | `confused`        | `marmot/callouts/warning-6.webp`       |
| `browser/…/content/browser/profiles/assets/kit-profiles-{light,dark}.svg`           | app menu, profiles                          | `badge`           | `marmot/business/badge.webp`           |
| `browser/…/content/browser/controlcenter/assets/fox-concern.svg`                    | site info panel, password breach alert      | `stop`            | `marmot/sheets/states.png`, cell 7     |
| `browser/chrome/browser/content/branding/about.png`                                 | about:logo (was Floorp's logo)              | `icon256.png` (K) | —                                      |

Sheet cells count row by row, left to right (4×2 grid). The cut poses were made
with `neoworks.dev/apps/web/scripts/cut-marmot-sheet.py`.

## Missing — shows in Kit today

| File (runtime)                                                                              | Shows in                                                                             | Needed                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `browser/…/skin/classic/browser/fxa/avatar-fox.svg`, `avatar-fox-circle.svg`                | account toolbar button, signed out (only with Firefox's `fox-circle` avatar variant) | Marmot **head only**, front facing, flat, readable at 16–32 px. Vector (SVG), square, transparent; the circle variant on a round filled background. Should be a real icon, not the illustration scaled down. |
| `browser/…/content/browser/kit-signed-out.svg`                                              | app menu, "sign in" promo next to the account item                                   | Head-and-shoulders marmot in a filled circle (avatar style), square ~96×96 (SVG ideal), transparent outside the circle.                                                                                      |
| `chrome/toolkit/skin/classic/global/illustrations/kit-in-circle.svg`                        | about:pdf promo card (also a newtab copy, unused)                                    | Same as above: marmot portrait in a circle, square ~120×120, transparent outside the circle.                                                                                                                 |
| `browser/…/content/browser/private-browsing-mask-intro.css` → `privatebrowsing/kit-pbw.svg` | private window intro                                                                 | Marmot wearing an eye mask (incognito), standing, ~3:4 portrait (fox is 120×160-ish), transparent.                                                                                                           |
| `browser/…/skin/classic/browser/privatebrowsing/fox-tail.svg`                               | about:privatebrowsing, page background anchored bottom right (`cover`)               | Marmot tail (or marmot peeking) as a quiet shape. Currently a single flat grey silhouette, wide ~2:1, transparent; works best as a one-colour SVG.                                                           |
| `browser/…/skin/classic/browser/tab-crashed.svg`, `tabbrowser/crashed.svg`                  | tab crashed page, crashed tab icon                                                   | Not a fox today (red "sad folder" / red "!"), but a **sad marmot** would fit the page: ~400×300 transparent illustration (e.g. marmot sitting next to a broken tab). The tab icon should stay a 16 px glyph. |
| `browser/…/skin/classic/browser/preferences/fox-ai.svg`                                     | about:preferences, AI features section                                               | Marmot with sparkles / a chat bubble, ~1:1, transparent. Only matters if Firefox's AI pane stays visible next to Kit's own AI settings.                                                                      |
| `browser/chrome/devtools/skin/images/fox-smiling.svg`                                       | DevTools performance panel, console easter egg                                       | Smiling marmot **face** icon, square, flat vector, works at 24–64 px.                                                                                                                                        |

## Missing — Firefox surfaces Kit doesn't show (low priority)

These still contain foxes but sit behind features Kit turns off or replaces
(Kit's own onboarding, new tab page and sidebar;
`browser.aboutwelcome.enabled
= false`). Replace them only if one of those
surfaces comes back.

- **about:welcome / onboarding**
  (`browser/chrome/browser/content/activity-stream/data/content/assets/`):
  `br-amo-fox-paint`, `br-backup-fox-in-box`, `br-backup-fox-outside-box`,
  `br-fxa-fox-mirror`, `br-gratitude-fox-rock`, `br-import-fox-house`,
  `br-kit-with-heart`, `br-migration-fox-juggle`, `br-set-default-fox-heart`,
  `fox-doodle-backup-restore`, `fox-doodle-tail.png`, `fox-doodle-waving.gif`
  (animated) / `-static.png`, `kit-sit-look-up`, `mr-kit-smart-window`.
- **Messaging (asrouter) spotlights**
  (`browser/…/content/browser/asrouter/assets/`): `fox-with-box-on-cloud`,
  `fox-with-checkmark`, `fox-with-devices`, `fox-with-locked-box`,
  `fox-with-mobile`, `fox-with-profiles`, `kit-checkmark`,
  `kit-checkmark-flipped`, `kit-peek`, `kit-peek-bottom`, `smiling-fox-icon`.
- **Firefox's new tab**
  (`browser/chrome/browser/builtin-addons/newtab/data/data/content/assets/`):
  `firefox-mascot-prop-heart-*` (6), `firefox-mascot-prop-paintbucket-rgb` (also
  in `highlights/`), `firefox-motion-head-pop-up-no-bg`, `kit.png`,
  `kit-default.png`, `kit-champion.png`, `kit-circle-animated`, `kit-in-circle`,
  `kit-stocks-watchlist`, `puzzle-fox`, `widget-privacy-kit`.
- **Firefox Smart Window** (`browser/…/content/browser/aiwindow/assets/`):
  `kit.svg`, `kit-meditating.svg`, `agent-watch-empty.svg`,
  `set-default-onboarding.svg`.
- **Firefox sidebar promo**: `browser/…/skin/classic/browser/sidebar/foxy.svg`.
- **Firefox View, other empty states**: `kit-page-history.svg` is replaced;
  `view-*.svg` / `empty-chat.svg` are monochrome icons, no fox.

## Not the mascot, but still Firefox / Floorp branding

Need Kit glyphs rather than a marmot (monochrome, `context-fill`, 16 px):

- Firefox logo glyphs: `browser/…/skin/classic/browser/firefox-view.svg`
  (Firefox View toolbar button / quick action), `sidebar/firefox.svg`,
  `window-firefox.svg`, `logos/share-firefox.svg`.
- `chrome/…/devtools/skin/images/aboutdebugging-firefox-*.svg`,
  `browsers/firefox.svg` (about:debugging, DevTools).
- `activity-stream/.../splash-logo.svg`, newtab `firefox.svg` (full-colour
  Firefox logo, unused surfaces).
- Floorp: `branding/floorp-pb-toolbar-icon.ico` (Windows private-window taskbar
  icon, Floorp's mascot), `branding/floorp-background.png` (not referenced),
  `branding/document.ico` (Windows file icon, generic).
- about:robots (`static-robot.png`, `aboutRobots-icon.png`) is Firefox's robot
  easter egg, no fox.

## App icon

The window/app icon and about-dialog logo are Kit's placeholder "K" mark
(`kit.svg`), not a fox, so they were left alone. If Kit's icon should become the
marmot, it needs a dedicated **vector marmot app icon**: square, simple
silhouette or head, legible at 16 px, on a rounded-square tile, plus an
`about-logo` at 192/384 px — `generate.ts` turns `kit.svg` into all sizes. None
of the current marmots work at that size.
