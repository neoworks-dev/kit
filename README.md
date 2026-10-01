# Kit

Kit is Neoworks' browser: keyboard-first, with a sidebar for tabs, workspaces
and containers, spotlight for search and commands, and a customizable new tab
page. It runs on Gecko.

## Development

Requires [Deno](https://deno.com) 2.x.

```bash
deno install
npm run dev        # build, start the dev servers and launch Kit with HMR
npm test           # browser tests
deno task test:host
```

The first run downloads the Gecko runtime pinned in `floorp-runtime.lock.json`
into `_dist/bin`.

## Linux package

```bash
deno task feles-build package
```

Builds Kit in production mode on the locked release runtime and packs it into
`_dist/package/kit-<version>-linux-<arch>.tar.xz`. To install, unpack it
anywhere and run `./kit/install.sh` (add `--default` to make Kit the default
browser, `--uninstall` to remove it). Kit keeps its profile in
`~/.local/share/kit/profile`. The production build replaces the dev outputs
in `bridge/*/_dist`, so run `deno task dev-tool rebuild` before going back to
`npm run dev`. See `AGENTS.md` for the architecture, conventions and the
`dev-tool` CLI for driving a running browser.

## License

MPL-2.0, see `LICENSE`.
