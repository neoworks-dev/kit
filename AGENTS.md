# AGENTS.md

Kit is Neoworks' browser. It runs on a prebuilt Gecko runtime (currently
Floorp-Runtime, pinned in `floorp-runtime.lock.json`) and this repo holds
everything on top of it: the browser chrome UI, privileged modules, the new
tab page, runtime patches, prefs and branding.

## Commands

```bash
deno install                        # Install dependencies
deno task feles-build dev           # Dev mode with HMR (ports 5181, 5186)
deno task feles-build build         # Production build (two-phase: --phase before-mach / --phase after-mach)
deno task feles-build stage         # Staging build
deno task feles-build test          # Launch browser with Marionette for automated testing
deno task feles-build misc patch    # Manage runtime patches (apply/create/init)
deno task test                      # Run browser tests (colocated test runner)
deno task test -- --near <path>     # Run tests near a specific file/directory
deno task test -- --layer chrome    # Run only chrome-layer tests (also: esm, pages, all)
deno task test:host                 # Run tool tests (Deno native)
deno task test:smoke                # Smoke tests
deno task dev-tool                  # Development utility CLI
```

`FLOORP_DEV_RUNTIME_DISTRIBUTION=release` (used by the `package.json` scripts)
installs the locked release runtime instead of the latest debug build.

## Architecture

```notes
Runtime       ← prebuilt Gecko; tools/patches, static/gecko/pref/override.ini,
     ↓          static/gecko/branding (applied to _dist/bin on every build)
ESM Modules   ← browser-features/modules: .sys.mts with Firefox APIs, window actors
     ↓
Bridge        ← bridge/: startup scripts that load the chrome UI from Vite (dev)
     ↓          or chrome://noraneko/ (prod)
Chrome UI     ← browser-features/chrome/common/neoworks-*: SolidJS → XUL via
     ↓          @nora/solid-xul, auto-discovered by import.meta.glob
New tab       ← browser-features/pages-newtab: SolidJS page for about:newtab/home
```

The bridge (`bridge/startup/src/chrome_root.ts`) is the bootstrap: in dev/test
mode it loads from `http://localhost:5181/loader/index.ts` with retry logic; in
production it loads `chrome://noraneko/content/core.js`. Internal names
(`noraneko`, `NR*` actors, `resource://noraneko`) are plumbing, not branding.

Kit's settings live in its own pane in about:preferences
(`bridge/startup/src/kit-preferences`).

## Tech Stack

- **Runtime**: Deno 2.x
- **UI**: SolidJS everywhere. Browser chrome renders XUL through
  `@nora/solid-xul`; the new tab page uses its own HTML renderer
  (`pages-newtab/src/lib/renderer.ts`, see the comment there for why)
- **Styling**: `@neoworks-dev/ui` tokens (copied into `neoworks-ui/glass.css` and
  `pages-newtab/src/globals.css`), Phosphor icons as CSS masks
  (`neoworks-ui/icons.css`), Tailwind on the new tab page
- **Build**: Vite via the `feles-build` system (`tools/feles-build.ts`)
- **Language**: TypeScript (strict)

## Path Aliases (deno.json)

```typescript
#libs/              → ./libs/
#features-chrome/   → ./browser-features/chrome/
#modules/           → ./browser-features/modules/
#features-modules/  → ./browser-features/modules/
```

## Coding Conventions

### File Placement

| What               | Where                                                         |
| ------------------ | ------------------------------------------------------------- |
| Browser UI feature | `browser-features/chrome/common/neoworks-{name}/`             |
| Firefox API module | `browser-features/modules/modules/{name}.sys.mts`             |
| Actor (IPC)        | `browser-features/modules/actors/{Name}Parent\|Child.sys.mts` |
| New tab widget     | `browser-features/pages-newtab/src/widgets/`                  |
| Kit settings       | `bridge/startup/src/kit-preferences/`                         |
| Runtime patch      | `tools/patches/*.patch`                                       |
| Default prefs      | `static/gecko/pref/override.ini`                              |
| Branding           | `static/gecko/branding/`                                      |

### Feature Auto-Discovery

`browser-features/chrome/common/mod.ts` uses `import.meta.glob("./*/index.ts")` —
adding a directory with an `index.ts` under `common/` is sufficient.

Actor registration is manual: add entries to `JS_WINDOW_ACTORS` in
`browser-features/modules/modules/BrowserGlue.sys.mts`.

### New tab widgets

Widgets register with `registerWidget(defineWidget({...}))`
(`pages-newtab/src/widgets/registry.ts`) and get their settings as reactive
props. The layout (`neoworks.newtab.layout` pref) stores only type ids, so a
widget whose type isn't registered stays in the layout until it is.

### Type Definitions

Separate types into dedicated `types.ts` files. Exception: `.sys.mts` files may
include inline types.

### No `any`

Never use `any`. Use explicit types or `unknown`.

### SolidJS Pattern (Browser Chrome)

```typescript
import { noraComponent, NoraComponentBase } from "#features-chrome/utils/base.ts";

@noraComponent(import.meta.hot)
export default class MyFeature extends NoraComponentBase {
  init(): void {
    /* ... */
  }
}
```

- Always use `@noraComponent(import.meta.hot)` for HMR support
- Use `createSignal` / `createMemo` for reactive state — never mutate variables directly

### Firefox ESM Modules (.sys.mts)

```typescript
const { SomeService } = ChromeUtils.importESModule(
  "resource://gre/modules/SomeService.sys.mjs",
);
```

### Text

UI strings are plain English; there is no localization layer.

### Prefs

Kit's prefs use the `neoworks.` prefix.

### Error Handling

Use try/catch with `console.error("[FeatureName]", ...)` prefix for log messages.

## Testing

Tests run **inside the actual browser**, not in Deno/Node. They are plain
TypeScript functions with a custom harness
(`browser-features/chrome/test/utils/test_harness.ts` providing `assert`,
`assertEquals`, `TestCase`, `runTests`), not `Deno.test()`.

```typescript
// @colocated-env browser
import { type TestCase, assert, runTests } from "../../../test/utils/test_harness.ts";

function testSomething(): void {
  assert(condition, "message");
}

export async function runAllTests(): Promise<void> {
  const tests: TestCase[] = [{ name: "something works", fn: testSomething }];
  await runTests("something.test.ts", tests);
}
```

Colocated in `test/` directories next to source. The runner discovers them
automatically. Tools tests (`tools/src/*.test.ts`) are regular `Deno.test()`
and run with `deno task test:host`.

## Dev Server Ports

- 5181: Chrome UI loader (bridge)
- 5186: New tab page

## dev-tool — Browser Inspection CLI

`deno task dev-tool` communicates with a running Kit instance via the **Marionette protocol** (Firefox's TCP-based WebDriver). All browser commands require the browser to be running (started via `dev-tool start` or `feles-build dev`).

### Process Management

```bash
deno task dev-tool start      # Start dev server + browser in background (waits for Marionette ready)
deno task dev-tool stop       # Kill all dev processes (deno, vite, browser) cleanly
deno task dev-tool restart    # Stop then start
deno task dev-tool rebuild    # Rebuild startup + modules + inject XHTML without restarting browser (HMR handles loader-features)
```

### Browser Commands

```bash
deno task dev-tool status                                      # Check connection: shows page title, URL, tab count, active tab
deno task dev-tool eval "JSON.stringify(Services.prefs.getStringPref('neoworks.some.pref'))"  # Execute JS in browser (returns result)
deno task dev-tool console                                     # Last 50 console messages (via Services.console)
deno task dev-tool console -l 100 -f "workspace" -l error      # Filtered: 100 messages, text filter "workspace", errors only
deno task dev-tool console --level error                       # Level filter: error/warn/info/debug/all
deno task dev-tool screenshot                                  # Full-page screenshot → _dist/screenshot.png
deno task dev-tool screenshot -s "#tabbrowser-tabs" -o out.png # Element screenshot by CSS selector
deno task dev-tool navigate about:preferences                  # Navigate browser to URL
deno task dev-tool dom "#sidebar-box"                          # Inspect DOM: tag, id, class, text, attributes, child count
deno task dev-tool title                                       # Get current page title
```

### Context Flag (`--context` / `-c`)

All browser commands accept `--context` to choose the JS execution context:

- `chrome` (default) — browser chrome scope. Access `Services`, `gBrowser`, XUL elements, Firefox internals, prefs
- `content` — web content scope. Interact with loaded page DOM as a normal web page

```bash
deno task dev-tool eval "gBrowser.tabs.length" -c chrome    # Count open tabs (chrome context)
deno task dev-tool eval "document.title" -c content         # Get page title from content context
```

### Typical LLM Workflow

1. `deno task dev-tool start` — launch browser
2. Edit source files (HMR updates chrome UI automatically)
3. `deno task dev-tool console --level error` — check for runtime errors
4. `deno task dev-tool eval "..."` — inspect live state (prefs, DOM, services)
5. `deno task dev-tool screenshot` — visually verify UI changes
6. `deno task dev-tool rebuild` — if HMR didn't pick up changes (modules/startup only)
7. `deno task dev-tool stop` — shut down when done

## Issues

Issues live on `neoworks-dev/kit`. Create and edit them as the neoworks bot, not
as a person: prefix every write with the `gh bot` extension, e.g.
`gh bot issue create -R neoworks-dev/kit --title "…" --label "type:feature,area:sidebar"`.

Labels use canonical `category:value` names: `type:*` (feature, bug, chore,
design), `area:*` (keys, spotlight, sidebar, toolbar, containers, workspaces,
tabs, content, branding, build) and `priority:*` (high, medium, low). Give every
issue one `type:`, one or more `area:` and one `priority:` label. Split larger
work into one issue per part.

## Debugging

- Browser Console: `Ctrl+Shift+J` / `Cmd+Option+J`
- DevTools: `Ctrl+Shift+I` / `Cmd+Option+I`
- Log convention: `console.log("[FeatureName]", ...)`
