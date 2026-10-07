# dsh-llamacpp-bridge

> Makes the llama.cpp on your own machine show up in DSH's model list, next to the cloud models.

**English** | [中文](README.md)

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/platform-DSH%20web%20profile-blue)
![llama.cpp](https://img.shields.io/badge/llama.cpp-llama--server-orange)
![node](https://img.shields.io/badge/node-%3E%3D20-339933)

---

## Why this exists

If you already keep a llama.cpp build and a few GGUF files around, the daily routine probably looks like this: open a terminal, type a long line of flags, wait while the model loads into VRAM, then switch to another window and line up the endpoint address and the model name. Change your mind about the model and you start over. Drop a new file into the folder and you have to remember to update a list somewhere.

This plugin takes that routine off your hands. The model list is read straight from your models directory. The moment you pick a model and send your first message, it starts `llama-server` for you and waits until the server is genuinely ready. When you switch models it stops the old one first, then starts the new one. And the logs, the current status and which model is loaded are all visible in a panel in the sidebar.

All you do is put the GGUF files in a folder.

## What using it feels like

After you install it and restart DSH, a row appears in the sidebar under "New session" — **"llama.cpp 终端输出监控"** (llama.cpp terminal output monitor), with a line-drawn terminal icon, sitting next to the task board.

The first time around, open **Settings → llama.cpp**. It looks for `llama-server` and your models directory in the usual places (`~/llama.cpp/build/bin`, `~/llama.cpp/models` and so on), shows you what it found as candidates, and lets you browse for them by hand if it guessed wrong. You only do this once.

Then go back to a conversation and pick a local model from the model picker. The moment you hit send, the plugin brings the server up in the background; the request only goes out once it's ready, so from inside DSH it feels no different from a cloud model.

To see what's going on, click the sidebar row and the panel expands. At the top is the current state (model, pid, context length), then a row of model buttons (those with a vision projector get a 👁), and below that the scrolling terminal output — every line `llama-server` prints, with a timestamp and a source tag. Switching models is just clicking another button.

To go back, click **"← 返回会话"** (back to conversation) in the panel's top-left corner. Clicking any session in the sidebar, or pressing Esc, does the same thing.

## Installing it

You need a DSH installation (the `web` profile), a llama.cpp build that includes `llama-server`, and Node 20 or newer.

### From a release (the easy way)

Download `dsh-llamacpp-bridge-1.5.0.tgz` from the Releases page, then:

```bash
dsh plugin --profile web add ./dsh-llamacpp-bridge-1.5.0.tgz
```

### From source

The `dist/` directory is committed, so if you just want to use it, clone and pack:

```bash
git clone https://github.com/b8yg7vjstj-ctrl/dsh-llamacpp-bridge.git
cd dsh-llamacpp-bridge
npm pack
dsh plugin --profile web add ./dsh-llamacpp-bridge-1.5.0.tgz
```

To rebuild it yourself, there are two extra steps. One catch first: the `@deepseek-ai/*` type packages are not on npm — they ship with DSH itself — so a script links them into the project. The order matters, because `npm install` prunes anything that isn't declared in `package.json`:

```bash
npm install          # 1) devDependencies first
npm run link:dsh     # 2) then link the DSH type packages
npm run check        # 3) typecheck + build
npm pack             # 4) produces an installable tgz
```

If the script can't find your DSH installation, point it there:

```bash
DSH_INSTALL=/opt/homebrew/lib/node_modules/@deepseek-ai/dsh npm run link:dsh
```

### Two steps you can't skip afterwards

First, **restart the host**. `dsh plugin add` only writes files to disk; the DSH that is already running won't pick up a new plugin on its own:

```bash
lsof -nP -iTCP:3080 -sTCP:LISTEN   # note the PID
kill <PID>
cd ~ && dsh web
```

Second, **hard-refresh the browser** (`Cmd/Ctrl + Shift + R`). If the page is still holding the old version, it keeps asking for a script that has since been replaced and the console fills up with `bundle script ... failed to load`. Nothing is broken — a refresh sorts it out.

One more thing: `dsh plugin add` registers the plugin in `dsh.profile.bundles` for you, so you never edit `package.json` by hand. Removing it is the same command in reverse:

```bash
dsh plugin --profile web remove dsh-llamacpp-bridge
```

## What it actually takes care of

**It runs the server.** Two modes are supported: one model at a time (`-m <model>`), or router mode (`--models-dir` plus `/models/load` and `/models/unload`, where switching doesn't mean restarting the process). Which one is used is decided by the `strategy` setting, and by default it works that out itself. After spawning, it polls the HTTP port and only treats the server as ready — and only lets your request through — once `ready on http://...` shows up in the log.

**It stops the old model before loading the new one.** That ordering is deliberate: on a switch it stops the current model, waits until it's actually gone, and only then starts the target one. Both steps are written to the log. The point is that two models never sit in VRAM at the same time.

**It keeps the model list in step with the folder.** Every startup rescans the whole directory (that's the `scanned N model(s) ... (startup rescan)` line). Later reads compare the directory's modification time and entry count and rescan only when something changed. Real changes on disk are noticed through `fs.watch`, with a 30-second fallback poll in case the filesystem drops events. If the directory doesn't exist yet — an external drive that isn't mounted, say — it retries every 5 seconds and hooks itself up as soon as it appears. There's also a "refresh" button in the panel for doing it by hand.

**It pairs up vision projectors.** A GGUF with vision needs a matching mmproj file before it can look at images. The plugin pairs them in three tiers: whatever you bound by hand in the settings page wins; then the `<model>-mmproj.gguf` naming convention; and last the `mmproj-xxx.gguf` prefix style, where it normalizes both names (dropping quantisation tags and words like `it` or `instruct` that say nothing about *which* model this is), matches them as substrings and scores the result, picking the closest one. Once paired, `--mmproj` is added to the launch arguments automatically. When there isn't enough to go on — a lone `mmproj-F32.gguf`, for instance — it doesn't guess; it writes `unmatched mmproj: ...` into the startup log and leaves it to you to bind in the settings page.

**It shortens names that are too long.** A display name longer than 30 characters is shown as its first 30 characters plus `...`. The real id is untouched, so selecting and calling the model are unaffected. Hovering over the button shows the full name.

## The settings

**Settings → llama.cpp** is the graphical part: pick the executable, pick the models directory (both support browsing for a folder), bind mmproj files, and adjust the values below. Changes take effect while running — most of them don't need a DSH restart.

| Field | Default | What it means |
|---|---|---|
| `displayName` | `Local llama.cpp (bridge)` | The name shown in the model picker |
| `executable` | empty | Path to `llama-server`; empty means auto-detect |
| `modelsDir` | empty | Models directory; empty means auto-detect |
| `host` / `port` | `127.0.0.1` / `8080` | Where the server listens |
| `strategy` | `auto` | `auto` / `single` / `router` |
| `contextLength` | — | Context length passed as `-c` |
| `autoContext` | `false` | Work the context length out from available VRAM |
| `gpuLayers` | `-1` | Passed as `-ngl`; `-1` leaves it to llama.cpp |
| `mmprojSuffix` | `-mmproj.gguf` | The suffix convention for projector files |
| `mmprojOverrides` | empty | Manual bindings, shaped like `{ modelId: projectorFile }` |
| `additionalArgs` | empty | Anything extra you want to hand to `llama-server` |
| `startTimeoutMs` | `120000` | How long to wait for readiness |
| `debug` | `false` | Also logs things like the effective command line |

There's also a read-only "discovery" namespace, `llamacpp-bridge-discovery`, holding what the startup probe found: executables, models directories, the model list and the projector pairings. That's exactly what the settings page displays.

## The panel in the sidebar

The entry row isn't registered on a DSH seat. It's injected directly near "New session" in the sidebar (with a `MutationObserver` watching, so it puts itself back if another plugin moves things around or re-renders), which makes it a peer of the task board rather than something nested under it.

Clicking it opens a panel of its own, mounted over the conversation column; while it's active the column's original contents are hidden so the two don't overlap. Inside, top to bottom: a line reminding you what the plugin does, the current status, the model buttons, a refresh button, and the terminal output (with timestamps and `stdout` / `stderr` / `system` / `terminal` tags, plus keyword filtering, clear and auto-follow).

The panel talks to the host over same-origin HTTP rather than DSH's internal event channel:

| Route | Method | Purpose |
|---|---|---|
| `/api/llamacpp-bridge/state` | GET | A snapshot: provider, plugin purpose, status, model list, log tail |
| `/api/llamacpp-bridge/events` | GET | SSE stream: a snapshot frame, then log increments and status diffs, with a heartbeat every 15 s |
| `/api/llamacpp-bridge/action` | POST | For now just `{"action":"graceful-stop"}`, returning the steps taken |

All three are fenced to same-origin requests (loopback socket, loopback Host header and a same-origin marker must all hold), so an outside page can't reach them.

## What the graceful shutdown button really does

That button is **not** a hard kill. It reproduces what you'd do in a terminal: press Ctrl+C, then type `Y`.

When the plugin starts `llama-server` it tries to allocate a real terminal (a PTY) and logs `已分配终端（支持 Ctrl+C / Y 交互）`. Pressing the button sends SIGINT to the foreground process group — the same thing Ctrl+C does in a terminal — then waits 800 ms so the server can print its confirmation prompt, then writes `Y` into the terminal input. After that it waits for the process to go away.

Only if it doesn't leave does it escalate: another Ctrl+C, another 5 seconds, and as the very last resort the ordinary `terminate()` path (SIGTERM first, SIGKILL after the grace period). It never opens with a hard kill. Where no terminal can be allocated, it falls back to piped mode — same sequence, except the signal goes to the process id and the `Y` goes to stdin.

The server's own prompt (something like `Press Y to confirm exit`) appears verbatim in the panel log, so you can watch the whole thing happen.

## How it's put together

It's a standard two-package DSH plugin: `.` in `package.json` points at the host-side Node entry, `./client` at the browser bundle, and `cordis.patch.yml` mounts it into DSH's composition. Each half minds its own business:

- `src/host/index.ts` — the entry: probes the environment, registers settings, builds the catalog store and process manager, registers the provider route and the data plane
- `src/host/adapter.ts` — the adapter behind the `llamacpp` route: `ensure()` before each call, and translation both ways between DSH messages/streams and OpenAI-compatible SSE
- `src/host/llama-server.ts` — process management: terminal and piped spawning, single and router modes, readiness probing, graceful shutdown
- `src/host/model-store.ts` — directory scanning, three-tier mmproj pairing, fingerprint-based rescans, self-healing watching
- `src/host/discover.ts` — finds executables and models directories at startup and reports projector pairings
- `src/host/terminal-routes.ts` — those three HTTP/SSE routes
- `src/host/log-hub.ts` — a ring buffer of logs the panel can read increments from
- `src/host/config.ts` — defaults, the settings schema and the discovery schema
- `src/client/index.tsx` — client entry: injects services, registers the settings page, mounts the entry row and panel
- `src/client/terminal-mount.ts` — the injected entry row and the self-owned panel (toggling, escape hatches, mutual exclusion, self-healing)
- `src/client/terminal-panel.tsx` — the panel UI and model switching
- `src/client/setup.tsx` — the settings page
- `scripts/wrap-client.mjs` — wraps esbuild's output in the shape DSH's module loader expects
- `scripts/link-dsh-types.mjs` — links type packages from a local DSH installation

## Notes for whoever touches this next

These are the things that actually cost a day when you get them wrong:

1. **cordis service injection has two opposite traps.** Reading a service you didn't declare in `inject` throws `cannot get property "X" without inject`. But declaring a service in the exported `inject` that isn't available in the current scope makes the fiber wait forever — the plugin **silently never applies, with no error at all**. The safe pattern: core services in the exported `inject`, everything else awaited locally with `ctx.inject([...], cb)`.
2. **`list` seats require an `id`** (`sidebar.footer.action`, `settings.section`, `conversation.view`), otherwise you get `list slot ... requires options.id`.
3. **Don't go back to the "DOM overlay plus CSS hiding the native conversation" approach.** It produces overlapping controls and a conversation you can't return to.
4. **A native `conversation.view` tab is an unreliable entry point**: the session shell only renders tabs when a session is open *and* there's more than one tab, so clicking on the home screen finds no target and nothing appears to happen. That's why the entry row owns its own panel.
5. **`ctx.sessions` is a Service; the snapshot lives at `ctx.sessions.list`.** Pass the wrong one and creating the panel throws `getSnapshot is not a function`, after which the error boundary replaces the whole seat.
6. **The client bundle has a fixed contract**: it must call `window.__ModuleLoader__.load({ id: '<package name>', factory })`. React is external, and classic JSX needs `import * as React` — a default import compiles to `require('react').default`, which is `undefined`.
7. **esbuild flags**: use `--jsx=transform` (0.24 rejects `--jsx=classic`) and don't forget `--external:react-dom/client`.
8. **Keep the types structural and minimal.** Message blocks, the settings scope and subprocess handles are declared here only as the smallest shapes actually used, so revisions to DSH's own types don't break the build.
9. **pnpm's build gate**: `ERR_PNPM_IGNORED_BUILDS` (fsevents, sharp and friends) blocks any `dsh plugin add`; allow them via `allowBuilds` in the profile's `pnpm-workspace.yaml`.
10. **DSH is single-instance.** A second `dsh web` fails with `task-board ledger is already owned by process <pid>`.

## When something goes wrong

**No entry in the sidebar.** First check that the plugin really was loaded: in the browser console, see whether `/plugins/dsh-llamacpp-bridge/client.js` returns 200. A 404 means this DSH build didn't mount the plugin's client half. Also remember to restart `dsh web` after installing, and to hard-refresh the page.

**`bundle script ... failed to load` in the console.** That's the page cache: hard-refresh, or quit the window entirely (`Cmd+Q`) and reopen it.

**Clicking the entry does nothing.** Open the F12 console and look for lines starting with `[llamacpp-bridge]` or `slot entry crashed`; they say which step failed.

**The model list doesn't follow the directory.** Hit "refresh" in the panel. If it's still wrong, check that the directory named in the startup log's `scanned N model(s)` line is the one you're actually using.

**A vision model can't see images.** Look for `vision: <model> ← <projector>` in the startup log. Any `unmatched mmproj: ...` line points at a projector that needs binding to a model in the settings page.

**It fails at startup.** The log prints the effective command line and the error; check that `executable` and `modelsDir` point where you think they do.

**The port is taken.** Change `port` in the settings, or stop whatever is holding 8080.

**`ERR_PNPM_IGNORED_BUILDS`.** Add `allowBuilds: { fsevents: true, sharp: true }` to `~/.dsh/profiles/web/pnpm-workspace.yaml`.

**`ledger is already owned by process ...`.** DSH allows a single instance; close the other `dsh web` first.

## Building it yourself

```bash
npm install          # devDependencies
npm run link:dsh     # link local DSH type packages (must run after npm install)
npm run typecheck    # typecheck host and client
npm run build        # build dist/
npm run check        # typecheck + build
npm pack             # produce an installable tgz
```

`src/` is split into a host half and a client half, with `src/shared.ts` holding the constants and small helpers both sides use (provider id, route prefix, name truncation). After changing something, `npm pack` again, reinstall with `dsh plugin add`, then restart the host and hard-refresh the page.

## Not done yet

One item from the original requirements was asking the user about long contexts inside a conversation. Right now the context length can only be set on the settings page — DSH doesn't offer a seam for a plugin to interrupt a conversation with a question, so that one is still open.

## License

[MIT](LICENSE) © 2026 b8yg7vjstj-ctrl
