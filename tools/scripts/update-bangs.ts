// SPDX-License-Identifier: MPL-2.0

// Regenerates the spotlight's !bang list from Kagi's dataset (MIT,
// github.com/kagisearch/bangs), pinned to a release tag.
//
//   deno run --allow-net=raw.githubusercontent.com --allow-write tools/scripts/update-bangs.ts [tag]

const DEFAULT_TAG = "202610121511";
const OUTPUT = new URL(
  "../../browser-features/chrome/common/neoworks-spotlight/bangs.json",
  import.meta.url,
);

// Kagi's field names, as in their data/bangs.json.
interface KagiBang {
  // Site name.
  s: string;
  // Domain.
  d: string;
  // Main trigger.
  t: string;
  // More triggers.
  ts?: string[];
  // Search URL with {{{s}}} for the terms.
  u: string;
  // URL formats, e.g. "url_encode_placeholder".
  fmt?: string[];
  // Regex bangs; the spotlight doesn't run them.
  x?: string;
}

// Mirrors BangEntry in neoworks-spotlight/types.ts.
interface BangEntry {
  name: string;
  domain: string;
  triggers: string[];
  url: string;
  formats?: number;
}

const FORMAT_FLAGS: Record<string, number> = {
  open_base_path: 1,
  open_snap_domain: 2,
  url_encode_placeholder: 4,
  url_encode_space_to_plus: 8,
};

// Kagi applies all but open_snap_domain when a bang lists no formats, so
// entries without `formats` keep that default.
function formatFlags(fmt: string[] | undefined): number | undefined {
  if (!fmt) {
    return undefined;
  }
  return fmt.reduce((flags, name) => flags | (FORMAT_FLAGS[name] ?? 0), 0);
}

function usable(bang: KagiBang): boolean {
  if (
    bang.x || !bang.u.startsWith("https://") && !bang.u.startsWith("http://")
  ) {
    return false;
  }
  return !new URL(bang.u.replaceAll("{{{s}}}", "")).hostname.endsWith(
    "kagi.com",
  );
}

function toEntry(bang: KagiBang): BangEntry {
  const triggers = [bang.t, ...(bang.ts ?? [])].map((trigger) =>
    trigger.toLowerCase()
  );
  const entry: BangEntry = {
    name: bang.s,
    domain: bang.d,
    triggers: [...new Set(triggers)],
    url: bang.u,
  };
  const flags = formatFlags(bang.fmt);
  if (flags !== undefined) {
    entry.formats = flags;
  }
  return entry;
}

const tag = Deno.args[0] ?? DEFAULT_TAG;
const response = await fetch(
  `https://raw.githubusercontent.com/kagisearch/bangs/refs/tags/${tag}/data/bangs.json`,
);
if (!response.ok) {
  throw new Error(`Fetching Kagi's bangs at ${tag} failed: ${response.status}`);
}
const bangs = (await response.json()) as KagiBang[];
const entries = bangs.filter(usable).map(toEntry);
await Deno.writeTextFile(OUTPUT, JSON.stringify(entries) + "\n");
console.log(
  `Wrote ${entries.length} bangs from Kagi ${tag} to ${OUTPUT.pathname}`,
);
