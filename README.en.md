# dsh-llamacpp-bridge

> Turn your local **llama.cpp (`llama-server`)** into a first-class model provider for DeepSeek Harness: process and router management, model-catalog sync, on-demand auto-start, **stop-then-load** model switching, and a sidebar "llama.cpp terminal output monitor" panel.

**English** | [中文](README.md)

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/platform-web%20profile-blue)
![dsh](https://img.shields.io/badge/DSH-web%20profile-6f42c1)
![llama.cpp](https://img.shields.io/badge/llama.cpp-llama--server-orange)
![node](https://img.shields.io/badge/node-%3E%3D20-339933)

---

## What it is

DeepSeek Harness (DSH) ships with cloud models. This plugin lets you plug in **the llama.cpp on your own machine**: pick a local GGUF model from the `llamacpp` group in DSH's model picker, and the plugin starts `llama-server` for you — wiring up vision projectors (mmproj), context length, GPU layers and friends along the way.

It is a standard DSH **dual-package plugin** (host + client):

- **host** (Node ESM): registers the `llamacpp` model route, owns the `llama-server` child process, syncs the model catalog, and serves a same-origin HTTP/SSE data plane;
- **client** (browser bundle): a sidebar entry row, a self-owned panel, and a graphical settings page.

---

## Features

| Capability | Description |
|---|---|
| **Model route** | Registers the `llamacpp` provider alongside cloud providers; owns only its own route and never touches other providers' model subscriptions |
| **On-demand auto-start** | `ensure(model)` before every call: if the server is down it is started first, and the OpenAI-compatible port is only used once it is ready |
| **Stop-then-load switching** | When switching models the **previous model is stopped first**, then the target model starts (both steps are logged) — no two models fighting over VRAM |
| **Two run modes** | Single-model (`-m <model>`) and router mode (`--models-dir` plus `/models/load` and `/models/unload`) |
| **Catalog sync** | Full rescan at startup, fingerprint-based on-read rescan, `fs.watch`, and a fallback poll; a directory that appears later is picked up automatically |
| **mmproj vision pairing** | Three tiers: manual binding → suffix convention `<model>-mmproj.gguf` → **fuzzy prefix pairing** of `mmproj-*.gguf` (scored on normalized names). Paired models get `--mmproj` automatically |
| **Terminal monitor panel** | Sidebar entry row (peer of the task board) → self-owned panel: live SSE logs, stream tags, timestamps, keyword filter, clear, model switching, refresh |
| **Graceful shutdown** | The panel button uses real terminal interaction: **Ctrl+C (SIGINT to the foreground process group) → send `Y` to confirm** → wait for exit. No hard kill (see below) |
| **Guided setup** | The settings page auto-detects locations such as `~/llama.cpp/build/bin`, lists executable and model-directory candidates, and supports manual browsing |
| **Name truncation** | Model display names longer than **30 characters** are truncated to the first 30 plus `...` (the **id stays intact**, so selection and calls are unaffected) |

---

## Roadmap coverage (P0–P3)

| Item | Status | Where |
|---|---|---|
| ① Backend model switching from the whole models folder (not the launch script's list) | ✅ | `model-store` scans the directory; loaded state is decoupled from the script |
| ② Sidebar entry with model switching **and** terminal output | ✅ | DOM-injected entry row → self-owned panel with model switcher and live SSE logs |
| ③ Auto-start when a conversation begins | ✅ | `adapter.stream()` → `server.ensure()` (ready before the real connection) |
| ④ Unload the old model before loading the new one | ✅ | `ensure()`: stop and confirm the old model, then start the target |
| ⑤ Do not hook other model subscriptions | ✅ | Only `llm.registerAdapter(['llamacpp'], …)` |
| ⑥ Model config created at install time | ✅ | Own settings namespace plus a discovery namespace (models and projector pairings) |
| P1 Sync newly added models | ✅ | Startup rescan + fingerprint rescan + `fs.watch` + fallback poll |
| P1 Load mmproj together with the model | ✅ | Three-tier pairing + `--mmproj` |
| P2 Context length derived from memory | ✅ | `autoContext` + `pickContextLength` heuristic |
| P3 In-conversation long-context prompt | ⚠️ | Context length is configurable in settings; asking mid-conversation has no official seam yet |

Behavioral tests (real child processes and real file systems) cover: switching order, catalog add/remove reflected immediately, mmproj pairing and the `--mmproj` argument, the Ctrl+C → `Y` shutdown flow, and the 30-character truncation.

---

## Requirements

| Item | Requirement |
|---|---|
| DSH | `web` profile. Note: `0.1.7-rc.2` is defective — DSH does not load the plugin client bundle there (no UI), which is unrelated to this plugin |
| Node | ≥ 20 |
| llama.cpp | A build that provides `llama-server` (router mode needs a recent build; single-model mode works on older ones) |
| Platform | macOS / Linux (verified on Apple Silicon); Windows untested |

---

## Install

### Option A — from a Release (recommended)

Download `dsh-llamacpp-bridge-<version>.tgz` from Releases, then:

```bash
dsh plugin --profile web add ./dsh-llamacpp-bridge-1.5.0.tgz
```

### Option B — from source

> `dist/` is committed, so if you just want to use it, clone and `npm pack` — no build required.

To rebuild (the `@deepseek-ai/*` type packages are not on the npm registry; they ship with DSH and are linked by a script):

```bash
git clone https://github.com/b8yg7vjstj-ctrl/dsh-llamacpp-bridge.git
cd dsh-llamacpp-bridge

npm install          # 1) devDependencies first
npm run link:dsh     # 2) then link DSH type packages (order matters: npm install prunes undeclared links)
npm run check        # 3) typecheck + build
npm pack             # 4) produces dsh-llamacpp-bridge-<version>.tgz

dsh plugin --profile web add ./dsh-llamacpp-bridge-*.tgz
```

If the script cannot locate your DSH installation, point it explicitly:

```bash
DSH_INSTALL=/opt/homebrew/lib/node_modules/@deepseek-ai/dsh npm run link:dsh
```

### After installing

1. **Restart the host** — `dsh plugin add` only changes on-disk state; a running host will not hot-load the plugin.
   ```bash
   lsof -nP -iTCP:3080 -sTCP:LISTEN   # note the PID
   kill <PID>
   cd ~ && dsh web
   ```
2. **Hard-refresh the browser** — `Cmd/Ctrl + Shift + R`. A stale page keeps requesting the replaced bundle and reports `bundle script ... failed to load`.

> `dsh plugin add` **maintains `dsh.profile.bundles`** for you. To remove: `dsh plugin --profile web remove dsh-llamacpp-bridge`.

---

## Quick start

1. Install and restart as above, then open DSH.
2. Below "New session" in the sidebar you will find the entry row **"llama.cpp 终端输出监控"** (a line-art terminal icon, right after the task board).
3. On first use open **Settings → llama.cpp** and confirm the detected `llama-server` executable and models directory (pick manually if detection fails).
4. Select a local model from the `llamacpp` group in the model picker and send a message — the plugin starts the server and begins streaming once it is ready.
5. Click the sidebar entry to open the panel: live logs, model switching, **刷新 (refresh)** to rescan the directory, and **优雅退出 (graceful exit)** for the Ctrl+C → `Y` flow.

---

## Model switching semantics (important)

Switching models never calls the OpenAI port while the old model is still running. The actual order is:

```
[manager] 切换模型：先停止先前模型 <old model>（pid <pid>）
[manager] 先前模型已停止，开始启动目标模型 <new model>
... (server becomes ready) ...
[manager] ready on http://127.0.0.1:8080 (single)
```

In other words: **stop the old one, then start the new one**, and only then issue the request. In router mode the equivalent happens through `/models/unload` and `/models/load`.

---

## Configuration

### Settings page (guided)

**Settings → llama.cpp** provides:

- Executable candidates (auto-detected in `~/llama.cpp/build/bin/release`, `build/bin`, `build`, `bin`, `~/llama.cpp` and on `PATH`), selectable or browseable;
- Model-directory candidates (with `.gguf` counts), selectable or browseable;
- **③ Vision projector files (mmproj)**: lists every projector in the directory with its pairing result; an unpaired one can be bound to a model id inline;
- Advanced fields: port, run strategy, GPU layers, context length / auto inference, mmproj suffix, extra args, start timeout, debug logging.

### Settings namespace `llamacpp-bridge`

| Field | Default | Meaning |
|---|---|---|
| `displayName` | `Local llama.cpp (bridge)` | Provider display name |
| `executable` | `''` | Path to `llama-server`; empty = auto-detect |
| `modelsDir` | `''` | Models directory; empty = auto-detect |
| `host` / `port` | `127.0.0.1` / `8080` | Listen address and port |
| `strategy` | `auto` | `auto` / `single` / `router` |
| `contextLength` | — | `-c` context length |
| `autoContext` | `false` | Infer the context length from available memory |
| `gpuLayers` | `-1` | `-ngl`; `-1` leaves it to llama.cpp |
| `mmprojSuffix` | `-mmproj.gguf` | Suffix-convention projector name |
| `mmprojOverrides` | `{}` | Manual binding `{ modelId: projectorFile }` (highest priority) |
| `additionalArgs` | `[]` | Extra `llama-server` arguments |
| `startTimeoutMs` | `120000` | Readiness timeout |
| `debug` | `false` | Log the effective command line and similar detail |

### Discovery namespace `llamacpp-bridge-discovery` (read-only)

Startup probe results consumed by the settings page: `executables[]`, `modelsDirs[]`, `models[]`, `projectors[]` (each with `file` and, when paired, `modelId`).

---

## Sidebar panel and data plane

The entry row is DOM-injected (anchored near the sidebar's "New session" area, self-healing via `MutationObserver`). Clicking it toggles a **self-owned panel** (`createRoot` mounted into the conversation column; while active, the column's other children are hidden to prevent overlap). There are three ways back: the **"← 返回会话" (back to conversation)** button, clicking any sidebar identity row, or pressing **Esc**. It is mutually exclusive with other plugin panels via the `dsh-panel-activate` event.

Panel contents: plugin purpose echo → status line (phase / model / pid / context) → model switcher (👁 marks vision models, names truncated past 30 characters) → **刷新 (refresh)** → toolbar (graceful exit, clear, follow, filter) → terminal output (timestamp + stream tag `stdout` / `stderr` / `system` / `terminal`).

Data plane (same-origin HTTP; fenced by loopback socket + loopback Host + same-origin marker):

| Route | Method | Purpose |
|---|---|---|
| `/api/llamacpp-bridge/state` | GET | Snapshot: provider, plugin purpose, status, model list, log tail |
| `/api/llamacpp-bridge/events` | GET | SSE: `snapshot` first frame + `log` increments + `status` diffs + 15s heartbeat |
| `/api/llamacpp-bridge/action` | POST | `{"action":"graceful-stop"}` → `{ok, steps}` |

> Why not push host logs to the client over cordis events? The host→client `remote-event` frame is **allowlist-only** (owned by `dsh-api-remotes`), so custom events cannot be delivered. The official `webServer.register` SSE channel is used instead.

---

## Graceful shutdown (Ctrl+C → Y)

The panel's **"优雅退出（Ctrl+C → Y）"** button is **not** a hard kill:

1. **Spawn shape**: prefers `ctx.subprocess.spawnTerminal`, allocating a **real PTY** (logged as `已分配终端（支持 Ctrl+C / Y 交互）`); falls back to piped mode (`stdin: 'pipe'`) when terminals are unavailable.
2. **Ctrl+C**: in terminal mode, `signalForeground('SIGINT')` delivers SIGINT to the **foreground process group** — equivalent to pressing Ctrl+C in a terminal. In piped mode, `process.kill(pid, 'SIGINT')` (still SIGINT, **never SIGKILL**).
3. **`Y` confirmation**: waits 800 ms for the server's confirmation prompt, then writes `Y\n` (terminal `write()` or piped stdin).
4. **Escalation**: SIGINT → `Y` → wait 8 s → SIGINT again → wait 5 s → **only then** fall back to `terminate()` (SIGTERM → grace → SIGKILL). It never hard-kills directly.
5. The server's own prompt appears verbatim in the panel log (for example `Press Y to confirm exit`).

Measured call sequence: `spawnTerminal → signalForeground:SIGINT → write:"Y\n"`, with steps reported as `["已发送 Ctrl+C","已发送 Y 确认","确认后已退出"]`.

---

## Architecture

| File | Responsibility |
|---|---|
| `src/host/index.ts` | Plugin entry: environment discovery, settings registration, catalog store, server manager, provider registration, route registration |
| `src/host/adapter.ts` | `LlmAdapter` for the `llamacpp` route: `ensure()` before each call, DSH ↔ OpenAI SSE translation |
| `src/host/llama-server.ts` | `llama-server` process management: terminal/piped modes, single and router, readiness probe, graceful shutdown |
| `src/host/model-store.ts` | Directory scanning, three-tier mmproj pairing, fingerprint-based rescan, self-healing watcher |
| `src/host/discover.ts` | Executable and models-directory discovery, projector pairing report |
| `src/host/terminal-routes.ts` | Same-origin HTTP/SSE data plane (`state` / `events` / `action`) |
| `src/host/log-hub.ts` | Ring-buffer log bus (sequence, timestamp, stream, subscribe, incremental reads) |
| `src/host/config.ts` | Config defaults, settings schema, discovery schema |
| `src/client/index.tsx` | Client entry: service injection, settings section, mounting the entry row and panel |
| `src/client/terminal-mount.ts` | DOM-injected entry row + self-owned panel (toggle, escape hatches, mutual exclusion, self-healing) |
| `src/client/terminal-panel.tsx` | Panel UI: status, model switching, log stream, graceful exit, filtering |
| `src/client/setup.tsx` | Settings page: candidates, directory browsing, mmproj binding, advanced fields |
| `src/client/ollama-icon.ts` | Line-art terminal icon (inline SVG) |
| `scripts/wrap-client.mjs` | Wraps the esbuild CJS output into `window.__ModuleLoader__.load({...})` |
| `scripts/link-dsh-types.mjs` | Links DSH type packages from a local DSH installation for source builds |

---

## Implementation notes (lessons learned)

Read this before changing the code — every item below was an actual failure:

1. **Two opposing cordis injection traps**
   - Accessing a service that is not declared in `inject` throws `cannot get property "X" without inject`;
   - Declaring a service in the exported `inject` that is **not available in the current scope** makes the fiber wait **forever** — the plugin silently never applies, with no error at all.
   - Correct pattern: put core services in the exported `inject`, and wait locally for the rest with `ctx.inject([...], cb)`.
2. **`list` slots require an `id`** (`sidebar.footer.action`, `settings.section`, `conversation.view`), otherwise `list slot ... requires options.id`.
3. **Do not go back to "DOM overlay + CSS hiding the native conversation"**: it causes overlapping controls and an inability to return to the conversation.
4. **The native `conversation.view` tab is a poor entry point**: the session shell only renders tabs when a session is open **and** there is more than one tab, so clicking on the hero/home page finds no target (the infamous "点不动" / does-nothing bug). A self-owned panel behind the entry row is used instead.
5. **`ctx.sessions` is a Service; the snapshot lives at `ctx.sessions.list`** (passing the Service yields `getSnapshot is not a function` and the seat is replaced by an error boundary).
6. **Client bundle contract**: it must call `window.__ModuleLoader__.load({ id: '<package name>', factory })`. React is external, and classic JSX needs `import * as React` (a default import compiles to `require('react').default`, which is `undefined`).
7. **esbuild flags**: use `--jsx=transform` (`--jsx=classic` is rejected by 0.24) and always pass `--external:react-dom/client`.
8. **Types across versions**: the plugin only relies on **minimal structural types** for the DSH surface it actually uses (message blocks, settings scope, subprocess handle pid, …), so it keeps compiling as DSH evolves.
9. **pnpm build gate**: `ERR_PNPM_IGNORED_BUILDS` (fsevents/sharp and friends) blocks any `dsh plugin add`; allow them via `allowBuilds` in the profile's `pnpm-workspace.yaml`.
10. **DSH is single-instance**: a second `dsh web` fails with `task-board ledger is already owned by process <pid>`.

---

## Compatibility

- **Environment**: DSH `web` profile, macOS (Apple Silicon), `llama-server` in both single-model and router modes.
- **Known DSH-side issue**: on `0.1.7-rc.2` DSH does not load the plugin client bundle (`/plugins/<pkg>/client.js` returns 404 and the host log shows no plugin-side error), so the UI is invisible; the host half of the same package works (its routes are live). Use a DSH build without this defect.
- **Types**: minimal structural types keep the build working across DSH type revisions; type packages are linked from a local DSH install via `npm run link:dsh`.
- **Runtime**: the host entry must be resolvable inside the DSH profile (installing with `dsh plugin add` satisfies this).
- **Windows**: untested; terminal primitives and signal semantics differ (`gracefulStop` falls back to piped mode automatically).

---

## Troubleshooting

| Symptom | What to do |
|---|---|
| Nothing visible at all on 0.1.7-rc.2 | That DSH build never loads the client bundle (`/plugins/dsh-llamacpp-bridge/client.js` is 404) — a DSH-side issue, not a plugin error; use a working build |
| No sidebar entry row | Make sure the plugin is installed (`dsh plugin add` writes `bundles` for you) → **restart the host** → hard-refresh the browser (`Cmd/Ctrl+Shift+R`) |
| `bundle script /plugins/... failed to load` | Stale page cache: hard-refresh, or quit the app entirely (`Cmd+Q`) and reopen |
| Clicking the entry row does nothing | Open the F12 console and look for lines starting with `[llamacpp-bridge]` or `slot entry crashed` |
| Model list does not follow the directory | Hit **刷新 (refresh)** in the panel; the host rescans at every startup (`scanned N model(s) ... (startup rescan)`) and relies on `fs.watch` plus a 30 s fallback poll while running |
| Vision model has no effect | Check the host log for `vision: <model> ← <projector>` and `unmatched mmproj: ...`; bind unpaired ones under Settings → llama.cpp → "③ 视觉投影文件" |
| Fails on startup | The log prints the effective command line and the error; verify `executable` / `modelsDir` (the settings page can browse for them) |
| Port already in use | Change `port`, or stop whatever holds 8080 |
| `ERR_PNPM_IGNORED_BUILDS` | Add `allowBuilds: { fsevents: true, sharp: true }` to `~/.dsh/profiles/web/pnpm-workspace.yaml` |
| `ledger is already owned by process ...` | DSH is single-instance: close the other `dsh web` first |

---

## Development

```bash
npm install          # devDependencies
npm run link:dsh     # link local DSH type packages (must run after npm install)
npm run typecheck    # host + client typecheck
npm run build        # build dist/ (tsc for host, esbuild + wrapper for client)
npm run check        # typecheck + build
npm pack             # produce an installable tgz
```

Layout:

```
src/
  shared.ts              shared constants and helpers (provider id, route prefix, name truncation)
  host/                  Node ESM side (provider, process, catalog, HTTP/SSE)
  client/                browser bundle side (entry row, panel, settings page)
scripts/
  wrap-client.mjs        esbuild output → __ModuleLoader__ wrapper
  link-dsh-types.mjs     link type packages from a local DSH install
dist/                    build output (committed, so the plugin installs without building)
```

---

## License

[MIT](LICENSE) © 2026 b8yg7vjstj-ctrl
