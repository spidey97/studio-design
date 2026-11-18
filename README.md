# DesignStudio — source

Design, motion, media and 3D in one offline browser app. Free for noncommercial use: [PolyForm Noncommercial 1.0.0](LICENSE.txt). © 2026 DesignStudio.

## Download and use
1. Open the [latest release](../../releases/latest) and download **`DesignStudio.html`**: the whole app in one file, about 2.4 MB.
2. Double-click it. It opens in your browser and works offline. Nothing to install, no account.
3. Save your work with **File › Save** (`.designstudio.json` project files). To update, download the new `DesignStudio.html` and replace the old one in the same folder.

Recommended: Chrome or Edge (latest). Firefox and Safari also work.

## Run from source
Clone the repo and open `index.html` in Chrome / Edge. No build step, no server, no network.

## Layout
| Folder | Contents |
|---|---|
| `index.html` | App shell and script order (the order matters: later modules extend earlier ones) |
| `css/styles.css` | All styles |
| `js/core/` | `compat` (browser fallbacks) · `utils` · `version` · `model` (document, history, (de)serialisation) · `security` (file / project hardening, loads last) |
| `js/engine/` | `renderer` (canvas) · `exporters` (SVG, code, tokens, Lottie, SVG import) · `statemachine` · `scene3d-core` (shared 3D builder, also embedded in exports) · `interactive-export` |
| `js/design/` | `app` (controller: tools, selection, commands, keyboard, files) · `panels` · `layers` · `timeline` · `animate` · `triggers` · `components` · `prototype` / `protoflow` · `designsystem` · `guides` · `frames` · `arrows` · `export-ui` · `autosave` · `polish` (dialogs, toasts, welcome) |
| `js/media/` | `media-core` (decoders, ops, encoders) · `media-ui` · `media-guides` |
| `js/space3d/` | `space3d` (3D section) · `timeline3d` (dope sheet) · `guides3d` · `link3d-edit` (adjust linked 3D in Design) |
| `js/shell/` | `icons` · `sections` · `ui-shell` (shared top bar, movable dialogs) · `comments-sections` · `links` (cross-tab links) · `touch` · `brand` (logo, splash, About, tour, shortcuts) |
| `js/ai/` | `ai-core` · `ai-ui` · `mcp-host` (bridge client) |
| `js/vendor/` | three.js bundle (loaded on first 3D use), media libraries |
| `mcp/` | Local MCP bridge for AI apps (`designstudio-mcp.mjs`, Node 18+) |
| `docs/` | `USER-GUIDE.html`, release README |
| `tests/` | Production QA suite (Playwright + axe-core) and attack fixtures |
| `tools/build.mjs` | Release builder |
| `_versions/` | Full copy of every release |

Each module is a mixin assigned onto `StudioApp.prototype`; `bindX()` calls are made from the `StudioApp` constructor in `js/design/app.js`.

## Quality
```bash
cd tests && npm i && npx playwright install chromium
node qa.js                         # 157 tests in 21 suites (see tests/README.md)
node qa.js --app=../release/DesignStudio-<version>.html   # test the release build
node load.js                       # load & soak tests: big docs, leaks, playback, autosave, media, 3D, MCP server → tests/LOAD-REPORT.md
node load.js --quick               # ~2 min pass (or --only=s1,s9)
```

## Publishing to GitHub safely
1. `git init` (once), then run **`node tools/check-publish.mjs`**. It checks every file git would publish for API keys, tokens, private keys, `.env` files, private folders, personal paths and emails, and files over 50 MB. Only push when it says *All clear*.
2. `.gitignore` already keeps these out: `release/`, `_versions/`, `_backup/`, `Final/`, `projects/`, `assets/`, `docs/designs/`, `node_modules/`, secrets and test output.
3. Attach the build as a release file instead of committing it (see *Releasing*).
4. On GitHub: Settings › Code security › turn on **Secret scanning** and **Push protection**, and enable **Private vulnerability reporting** (see `SECURITY.md`). The included workflow (`.github/workflows/check.yml`) runs the same check on every push.

## Releasing
1. Bump `js/core/version.js` and add a `CHANGELOG.md` entry (`DS-<version>-NN` IDs).
2. `npm i -D terser` in `tools/` once, then `node tools/build.mjs` → `release/DesignStudio-<version>.html`.
3. From `tests/`: `node qa.js --app=../release/DesignStudio-<version>.html`; all suites pass.
4. Create a GitHub release tagged `v<version>` and attach the build renamed to `DesignStudio.html`.

## Security
Strict CSP in `index.html`; every file and project load goes through `js/core/security.js` (safe JSON, sanitising, pixel / size limits, inline-only images); glTF external references are refused in `scene3d-core`; the MCP bridge binds 127.0.0.1, checks Host / Origin and pairs with the tab.


## Developer handover (v3.35)

`js/shell/handover.js` adds a 4th section next to 3D.

- **Commit:** `hoCommit(roots)` freezes the selected screens into `model.handovers[]`. `hoRoots` maps any selection to its top-level layer. Each commit stores `{ n, title, message, status, screens: [{ id, name, w, h, thumb }], notes, doc: { pages, styles, variables, assets } }`. It is saved by `serialize()` and cleaned by `StudioModel.sanitizeHandovers` on load (only `data:image` previews are kept, and at most 60 versions).
- **Reading a version:** opening a version builds a read-only `StudioModel` from its `doc`. Specs and code come from the same exporters as Inspect and Export (`Exporters.inspect`, `code`, `tokens`, `svgDocument`).
- **Diff:** compares the version with the previous commit of the same screens, by element id.
- **Package:** the zip is built with `MediaLibs.zipSync`.

## GitHub (v3.34)

`js/shell/importer.js` adds File › Import… (Ctrl+I), which sends each file to the studio that can use it. `js/design/code-import.js` turns code into layers: HTML/CSS, JSX/TSX, Vue, Svelte and Tailwind offline (rendered in a script-free shadow root, then walked into frames, text, shapes and images); SwiftUI, Flutter and Compose through the AI. `js/ai/github.js` adds File › Import from GitHub… and the AI op `{"op":"github","action":"list|read|import","repo","ref","path","kind","paths"}`. `list` and `read` results are sent back to the model inside the same chat loop as MCP tools.

- **Requests:** reads only. The tree comes from the REST API (`git/trees?recursive=1`). File contents come from `raw.githubusercontent.com` for public repos, or from the API `contents` endpoint with a raw Accept header when a token is set.
- **Tokens:** an optional fine-grained token, kept in `sessionStorage` unless the user ticks Remember. `github_pat_…` tokens are now redacted in diagnostics.
- **Imports:** SVG becomes layers through `importSVGText`, PNG/JPG/WebP/GIF go through `importImageFile`, and `.dsplugin` files go through `pluginInstallText` with its permission prompt.
- **Limits:** at most 40 files of 5 MB each, and every import is confirmed by the user.

## One file & plugins (v3.33)

- `node tools/build.mjs` → `release/DesignStudio-<version>.html`, one file of about 2.3 MB. The scripts and styles are inlined. The 3D engine, MCP bridge, user guide, changelog and licences are embedded as `<script type="text/x-ds-file">` blocks that never execute; `js/core/embedded.js` (`DSEmbed`) reads them. `script-src` lists one SHA-256 hash for each script that may run, including the embedded 3D engine (run on first use by `DSEmbed.run`).
- `js/shell/plugins.js` provides the plugin system:
  - **Plugin Studio:** an editor with templates and AI writing.
  - **Sandbox:** each run is a fresh blob Web Worker. The bootstrap removes `fetch`, XHR, WebSocket, EventSource, `importScripts`, nested workers, IndexedDB, Cache Storage and BroadcastChannel before the plugin's code runs.
  - **API:** the `ds.*` calls are message-based and checked against the plugin's permissions (`read`, `write`, `ui`, `network` with a domain allowlist).
  - **Inputs:** layer props are whitelisted and passed through `StudioElement.fromJSON`.
  - **Limits:** 10 s of run time and 5,000 writes, and each run is one undo step.
  - **Storage and files:** plugins are saved in `localStorage` (`designstudio.plugins.v1`) and as `.dsplugin` JSON files.
- `js/shell/standalone.js` adds File › User Guide and File › Licences & Notices, plus saving the bridge files out of the single file.

## Settings & performance (v3.32)

- `js/shell/settings.js`: Edit › Settings… (`Ctrl+,`), saved in `localStorage` as `designstudio.settings.v1`. It holds the undo steps (10–100), the undo memory limit and the 3D performance mode.
- `js/core/model.js` `SnapChunks`: undo snapshots are split at content-defined boundaries and the chunks are shared between steps. 100 steps of a 5,000-layer document take about 7 MB, compared with about 690 MB as full copies.
- `js/space3d/perf3d.js` covers the following:
  - Cached shadow maps: redrawn only when casters or lights change.
  - Lower resolution while moving: Auto steps 100 → 75 → 60 → 50 % based on the measured frame time.
  - Shadow fallback in Auto mode: on very heavy scenes it switches to standard shadows.
  - Presets: Quality, Balanced, Performance and Custom.
  - Exports bypass all of it.
- `mcp/designstudio-mcp.mjs` hot path: the Host check is precompiled, `/health` is cached for 100 ms, `content-length` and keep-alive are sent, and URLs are parsed lazily. Measured at about 80k req/s on `/health` and about 16k on `tools/list`, with the security checks unchanged.

## Monitoring (v3.31)

DesignStudio has no server or database. Monitoring watches the tab itself:

- `js/core/diagnostics-core.js` loads first and exposes `window.DSDiag`. It holds a ring-buffer log (console errors and warnings, uncaught errors, promise rejections, CSP violations, `DSDiag.info/warn/error`), times every `fetch` (method, origin and path, status, ms; query strings, headers and bodies are never recorded, and secrets are redacted), observes long tasks and event-loop lag (CPU proxy), samples the JS heap, and records storage writes.
- `js/shell/diagnostics.js` adds the status-bar health dot, the Diagnostics panel (`Ctrl+Alt+D`), alert toasts, the connection test for IndexedDB and Store, autosave timing, a benchmark and `dgReport()` (JSON export).
- Limits are in `DIAG_LIMITS`: memory 70/85 %, main thread 30/60 % busy, lag 100/300 ms, API p95 3/8 s, error rate 20/50 %, storage 80/95 % (amber/red).
- `tests/load.js` covers 11 load and soak scenarios, measured through the DevTools protocol (TaskDuration for main-thread CPU, and the heap after forced GC). That includes a real load test of the MCP bridge server.
