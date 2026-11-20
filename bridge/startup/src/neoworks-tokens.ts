// SPDX-License-Identifier: MPL-2.0

// @neoworks-dev/ui's roles (packages/ui/src/styles/tokens.css in
// neoworks.dev) for Kit's privileged pages, as `--ui-*` so they can't clash
// with Firefox's own tokens. light-dark() picks the light or the .scope-dark
// value of each scale step, following the page's color scheme.

const GREY = {
  1: "light-dark(oklch(0.993 0.0015 100), oklch(0.165 0.004 100))",
  2: "light-dark(oklch(0.958 0.004 100), oklch(0.195 0.004 100))",
  3: "light-dark(oklch(0.932 0.004 100), oklch(0.232 0.004 100))",
  4: "light-dark(oklch(0.908 0.004 100), oklch(0.262 0.004 100))",
  5: "light-dark(oklch(0.884 0.004 100), oklch(0.292 0.004 100))",
  6: "light-dark(oklch(0.855 0.004 100), oklch(0.330 0.004 100))",
  8: "light-dark(oklch(0.730 0.004 100), oklch(0.480 0.004 100))",
  9: "light-dark(oklch(0.620 0.004 100), oklch(0.600 0.004 100))",
  11: "light-dark(oklch(0.500 0.004 100), oklch(0.790 0.004 100))",
  12: "light-dark(oklch(0.205 0.004 100), oklch(0.955 0.004 100))",
};

export const NEOWORKS_TOKENS_CSS = `
:root {
  /* In the dark, raised surfaces get lighter than the page. */
  --ui-canvas: light-dark(oklch(0.958 0.004 100), oklch(0.165 0.004 100));
  --ui-surface: light-dark(oklch(0.993 0.0015 100), oklch(0.195 0.004 100));
  --ui-sunken: ${GREY[3]};
  --ui-hover: ${GREY[4]};
  --ui-pressed: ${GREY[5]};

  --ui-line: ${GREY[6]};
  --ui-line-strong: ${GREY[8]};

  --ui-text: ${GREY[12]};
  --ui-text-muted: ${GREY[11]};
  --ui-text-faint: ${GREY[9]};

  --ui-fill: ${GREY[12]};
  --ui-fill-hover: color-mix(in oklch, ${GREY[12]}, ${GREY[1]} 14%);
  --ui-on-fill: ${GREY[1]};

  --ui-focus: oklch(0.560 0.110 255);
  --ui-danger: light-dark(oklch(0.470 0.135 35), oklch(0.800 0.120 35));
  --ui-danger-soft: light-dark(oklch(0.932 0.048 35), oklch(0.232 0.048 35));

  --ui-radius-control: 10px;
  --ui-radius-card: 16px;
  --ui-shadow-lift: 0 1px 2px oklch(0 0 0 / 0.04), 0 8px 24px -12px oklch(0 0 0 / 0.12);
  --ui-ease-out: cubic-bezier(0.22, 1, 0.36, 1);

  --ui-font-sans: "Geist Variable", "Geist", ui-sans-serif, system-ui, sans-serif;
  --ui-font-mono: "Geist Mono Variable", "Geist Mono", ui-monospace, monospace;
}
`;
