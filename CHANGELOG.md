# DesignStudio — Changelog

Every release bumps `APP_VERSION` (`js/version.js`), gets an entry here, and is copied in full to `_versions/v<version>/`.
Each change has an ID (`DS-<version>-NN`) so issues can be sorted, referenced and tracked.
**Reporting an issue:** status bar → click the version pill → *Copy diagnostics*, then note the ID of the feature involved.

| Status tags | |
|---|---|
| `NEW` new feature · `FIX` bug fix · `CHG` behaviour change · `KNOWN` known limitation / open issue |

---

## 3.37.0 — 2026-11-18 · Import anything, code to design

| ID | Tag | Change |
|---|---|---|
| DS-3.37.0-01 | NEW | **File › Import… (Ctrl+I).** The counterpart of Export, in every studio. Drop or choose any mix of files and each goes where it can be used: images and SVG to the Design canvas, video and GIFs to Media, GLB/glTF/OBJ/STL to 3D, token JSON to Variables, `.dsplugin` to Plugins, and a project file opens after you confirm. Cards let you pick the destination yourself, and a link opens Import from GitHub. "Open / Import…" is now "Open Project…". Code: `js/shell/importer.js`. QA: new `import` suite (5 tests). |
| DS-3.37.0-02 | FIX | **Overlapping UI.** View-menu checkmarks no longer cover the labels (menus with toggles reserve a check column). Typography › Resize buttons (Auto W, Auto H, Fixed) are sized to their labels instead of 26px icon squares. Menu labels keep a 20px gap from their shortcuts. In the Import dialog, Esc now works even when the 3D engine finishes loading and takes focus. |
| DS-3.37.0-03 | CHG | **Commit moves to the top bar.** The Commit to Handover button now sits left of Play, styled like the other top-bar buttons, instead of floating over the canvas. It still appears only when something is selected, and Play and Export never shift. The top bar now fits from 1024 px: below 1365 px Commit shows its icon and count only; below 1279 px Play and AI become icons; below 1199 px Grid, Snap and Timeline move to the View menu (shortcuts unchanged); below 1024 px the bar scrolls instead of clipping. QA: new top-bar fit test at 1024/1280/1440 px. |
| DS-3.37.0-04 | NEW | **Import code as design layers.** File › Import… now accepts code. HTML + CSS, React (JSX/TSX), Vue and Svelte single-file components, and Tailwind classes (v3 palette, spacing, type, radius, shadows, gradients, responsive variants resolved at 1440 px) are converted offline. The code is laid out by the browser in a hidden, script-free shadow root, and every visible box, text run, gradient, shadow, image and inline SVG becomes an editable layer in one new frame (pages are 1440 wide; components are cropped to what they draw). Images the code links to can be dropped in the same import. SwiftUI, Flutter, Jetpack Compose and Android XML are rebuilt by the connected AI model. Safety: `<script>`, event handlers, iframes, forms and external URLs are stripped, and the CSP blocks the rest. One import is one undo step. Code: `js/design/code-import.js`. QA: new `codeimport` suite. |

---

## 3.36.0 — 2026-11-08 · Free on GitHub

| ID | Tag | Change |
|---|---|---|
| DS-3.36.0-01 | CHG | **DesignStudio is now free.** It's published on GitHub under the PolyForm Noncommercial License 1.0.0: free for personal, hobby, study, education and non-profit use, but not for commercial use or resale. Files you create belong to you. `LICENSE.txt`, the About dialog, the build banner and the readmes are updated. |
| DS-3.36.0-02 | CHG | All payment and selling plans are removed: the payment design documents and their Goldfish review reports are deleted from `docs/designs/`. |
| DS-3.36.0-04 | NEW | **Safe GitHub launch.** A stricter `.gitignore` keeps out private folders, builds, secrets and `.env` files; `.gitattributes` sets line endings and binary files. Adds `SECURITY.md`, `CONTRIBUTING.md`, and `tools/check-publish.mjs`, a pre-push check for keys, tokens, private files, personal paths and large files. A GitHub Actions workflow runs the check on every push with read-only permissions. |
| DS-3.36.0-05 | CHG | **Project-only credits.** Personal and company names are removed from the app, licence notice, docs, brand book and brand applications. Credits now read "DesignStudio". |
| DS-3.36.0-03 | NEW | The README has GitHub instructions: download `DesignStudio.html` from Releases, run from source, and the release steps through a GitHub release. A `.gitignore` keeps out `node_modules`, `release/`, `_versions/` and test output. |

## 3.35.0 — 2026-11-05 · Developer Handover

| ID | Tag | Change |
|---|---|---|
| DS-3.35.0-01 | NEW | **Handover tab** next to 3D (`Ctrl+Alt+4`). It lists every handed-over version with its status, newest first, and can be filtered by status. |
| DS-3.35.0-02 | NEW | **Commit to Handover:** select finished screens in Design (`Ctrl+A` for everything) and a button appears at the bottom of the canvas (`Ctrl+Alt+Enter`). Add a title and a note to freeze a numbered version (v1, v2…) with a preview per screen; it opens in Handover. Selecting a layer inside a frame commits its whole screen. Later edits don't change committed versions. |
| DS-3.35.0-03 | NEW | **Inspect for developers:** click a layer for its specs, spacing to its screen and parent, colours, type, text, code (CSS, React, SwiftUI, Jetpack Compose, Flutter) and assets (SVG, PNG 1×/2×/3×, original image). Select one layer and hover another to see red-line distances. The overview lists the screen's colours and type styles with copy buttons. |
| DS-3.35.0-04 | NEW | **Versions and status:** Ready for development → In development → Changes requested → Done. Each version shows layers added, changed and removed since the previous version of the same screens, highlighted on the screen. |
| DS-3.35.0-05 | NEW | **Notes and package:** designers can leave a note for developers on any layer. **Download package** makes a .zip with a README, `spec.json`, `tokens.json`, screen previews, HTML + CSS and React code, and the original images. |
| DS-3.35.0-06 | CHG | Handover versions are saved in the project file and checked on load: only image previews are kept, with a maximum of 60 versions. In Handover, the Design-only top-bar controls (zoom, grid, snap, timeline, play, Edit/Animate) are hidden. |
| DS-3.35.0-07 | NEW | **QA:** a new `handover` suite (7 tests), and the axe accessibility check now covers the Handover tab. |

## 3.34.0 — 2026-11-05 · GitHub repos through AI

| ID | Tag | Change |
|---|---|---|
| DS-3.34.0-01 | NEW | **File › Import from GitHub…** Open `owner/repo` or any github.com link (folder links filter to that folder), filter by type, tick the files you want and import. SVGs become editable layers, PNG/JPG/WebP/GIF become images, and `.dsplugin` files install after the permission prompt. |
| DS-3.34.0-02 | NEW | **The AI can use repos.** A new `github` op lets the AI list a repo, read text files (tokens, CSS, README) and import assets inside the normal chat loop. Example: “turn the tokens in owner/repo into variables” reads the JSON and creates variables. Every import is confirmed by you. |
| DS-3.34.0-03 | NEW | **Private repos:** add an optional fine-grained token (Contents: Read-only). It is kept for the session unless you choose Remember, is sent only to api.github.com, and fine-grained `github_pat_` tokens are now redacted from diagnostics. |
| DS-3.34.0-04 | NEW | **Clear errors** for not-found or private repos, a refused token, and GitHub's hourly limit for requests without a token (shows the reset time). Safety limits: at most 40 files of 5 MB each per import. Repo code is never run. |
| DS-3.34.0-05 | NEW | **QA suite `github`** (8 tests, GitHub mocked so no network is needed): input parsing, list and read, confirm and cancel, SVG script stripping, token handling and redaction, error messages, the import dialog, and the AI chat loop from token file to variable. |

## 3.33.0 — 2026-11-05 · One standalone file + Plugin Studio

| ID | Tag | Change |
|---|---|---|
| DS-3.33.0-01 | NEW | **One standalone file.** The release is now a single `DesignStudio-3.33.0.html` (2.3 MB) instead of a folder. It carries the app, styles, media libraries, the 3D engine (started the first time 3D opens), the AI bridge, the user guide and the licences. Projects are never stored in it. |
| DS-3.33.0-02 | CHG | **Security policy for one file:** inline scripts are allowed only by their SHA-256 hashes (3 hashes). Injected or changed scripts can't run. |
| DS-3.33.0-03 | NEW | **Plugin Studio** (Plugins › Plugin Studio…). Write, run, save, export and delete plugins, with 6 templates, live output, `Ctrl+Enter` to run and `Ctrl+S` to save. Installed plugins appear in the new **Plugins** menu. |
| DS-3.33.0-04 | NEW | **Plugin sandbox and permissions.** Each run is a fresh Web Worker with no network, storage, DOM or app access. Plugins use the `ds.*` API only, within the permissions approved at install (read, write, ui, network with listed https domains). Runs stop after 10 s of work or 5,000 changes, and each run is one undo step. |
| DS-3.33.0-05 | NEW | **Write with AI** in Plugin Studio describes a plugin or a change. The AI writes the code and ticks the permissions it needs; you read it before running. |
| DS-3.33.0-06 | NEW | **`.dsplugin` files:** export to share, and Plugins › Import Plugin… installs one after showing its permissions. Malformed or oversized files are refused. |
| DS-3.33.0-07 | NEW | **File › User Guide** and **File › Licences & Notices** open the embedded copies. In the AI panel, AI apps has **Save bridge files**, which writes the MCP bridge and its Connect helpers out of the single file. |
| DS-3.33.0-08 | NEW | **QA suite `plugins`** (7 tests): sandbox, undo, sanitising, permissions, time limit, syntax errors, form injection and cancel, and the Studio round trip. All 166 tests pass on both the source and the single-file build. |

## 3.32.0 — 2026-11-05 · Settings: 100-step undo, 3D performance, faster MCP bridge

| ID | Tag | Change |
|---|---|---|
| DS-3.32.0-01 | NEW | **Settings window** (Edit › Settings…, `Ctrl+,`). It holds undo and 3D performance options, applies changes instantly, is saved in this browser, shows live numbers and has *Reset to defaults*. |
| DS-3.32.0-02 | CHG | **Undo: 100 steps by default, adjustable from 10 to 100.** Snapshots now share unchanged chunks, so 100 steps of a 5,000-layer document use about 7 MB instead of about 690 MB. The undo memory limit (200 MB–1.5 GB, default 400 MB) replaces the fixed 150 MB budget of 3.31 and keeps at least 10 steps. |
| DS-3.32.0-03 | NEW | **3D performance modes:** Auto (default), Quality, Balanced, Performance and Custom. Custom sets shadows, shadow resolution, high-DPI sharpness and resolution while moving. |
| DS-3.32.0-04 | CHG | **Cached 3D shadows.** Shadow maps are redrawn only when an object or light changes, never on camera orbit. A 120-object scene orbits about 2.1× faster, with 0 shadow redraws while orbiting. |
| DS-3.32.0-05 | NEW | **Adaptive resolution (Auto).** Rendering drops to 75/60/50 % while you orbit, drag or play when frames are slow, and returns to full resolution about 150 ms after you stop. On very heavy scenes, soft shadows switch to standard. Exports always render at full quality. |
| DS-3.32.0-06 | CHG | **MCP bridge throughput.** The earlier 7,800 req/s figure was the limit of the test client, not of the server. The hot path is now optimised: Host check compiled once, cached `/health`, `content-length`, keep-alive, lazy URL parsing, CORS headers only when needed. Measured with autocannon at 64 connections: **`/health` about 82,000 req/s (p99 2 ms)** and **`tools/list` about 16,700 req/s**, 0 errors. The security checks are unchanged. |
| DS-3.32.0-07 | FIX | The interactive HTML export now bundles the new undo chunk store; it failed with "SnapChunks is not defined" in a pre-release build. |
| DS-3.32.0-08 | NEW | **Load tests** were updated. s6 uses GPU-synced timing and compares Auto with the previous behaviour. s9 uses autocannon with targets of ≥ 10,000 and ≥ 5,000 req/s. s11 checks 100 undo steps at 5,000 layers. QA adds tests for Settings and 3D performance, and the shortcut sheet lists `Ctrl+,`. |

## 3.31.0 — 2026-11-05 · Monitoring, diagnostics & load testing

| ID | Tag | Change |
|---|---|---|
| DS-3.31.0-01 | NEW | **Diagnostics panel** (Help › Diagnostics…, `Ctrl+Alt+D`, or the status-bar health dot). Overview tiles show memory, main-thread load (CPU), responsiveness, frame rate, storage, API response time and errors, with history. Plus Logs, Network, Storage and Benchmark tabs, and *Export report* (JSON). |
| DS-3.31.0-02 | NEW | **Application logs:** a 1,000-entry log capturing console errors and warnings, uncaught errors, unhandled promise rejections, CSP violations and app events. Filter, search, copy and export. The previous session's last 200 entries survive a reload or crash. API keys and tokens are redacted. |
| DS-3.31.0-03 | NEW | **API response-time tracking:** every network call (AI providers, the MCP bridge, local models) is timed per service (p50, p95, max, errors). The MCP long-poll is recognised and excluded. Query strings, headers and bodies are never recorded. |
| DS-3.31.0-04 | NEW | **CPU and memory monitoring:** main-thread busy % from Long Tasks, event-loop lag, frame rate (while the panel is open), JS heap with trend and undo-history size. |
| DS-3.31.0-05 | NEW | **Storage ("database") monitoring:** the IndexedDB connection test (round trip, localStorage fallback detection), quota use, persistence request, and autosave write timings and failures, including writes to the project file. |
| DS-3.31.0-06 | NEW | **Health alerts:** amber/red thresholds (`DIAG_LIMITS`). One tip when memory, main thread or a service turns red, repeated at most every 5 min. The status dot has an accessible label. |
| DS-3.31.0-07 | FIX | **Undo history memory budget.** The soak test showed 100 full-document undo snapshots reaching ~220 MB at 1,600 layers. History is now capped at ~150 MB and always keeps at least 20 steps. |
| DS-3.31.0-08 | NEW | **Load & soak tests** (`tests/load.js` → `tests/LOAD-REPORT.md`): 5,000-layer document, leak cycles, playback, autosave under load, 120-frame GIF, 120-object 3D scene, 60 s random-editing soak, API-timing accuracy against a mock service, MCP bridge server load (3,000 requests at concurrency 50), undo budget and monitoring overhead. |
| DS-3.31.0-09 | NEW | QA suite `diagnostics` (9 tests). The ? shortcut sheet lists `Ctrl+Alt+D`. |

## 3.30.2 — 2026-11-04 · Readable graphic language

| ID | Tag | Change |
|---|---|---|
| DS-3.30.2-01 | FIX | **The link-node network never runs behind text.** New `brand/netgen.py` draws the network only inside empty zones of each layout. Applied to the link preview, profile banner, social post, slide cover, website hero, business card and brand book cover; dot grids are also quieter (60%). |
| DS-3.30.2-02 | CHG | The brand book cover network moves to the clear top-right corner and is hidden on phones; the cover wordmark now scales on small screens. |

## 3.30.1 — 2026-11-04 · Competitor analysis, contact details

| ID | Tag | Change |
|---|---|---|
| DS-3.30.1-01 | NEW | **Competitor analysis** of Figma, Penpot, Rive, Spline and Jitter, as of November 2026. It covers features, where each tool runs, starting price, a positioning map and insights, with sources. It lives in `brand/research/competitors.json` and appears in the brand book under Foundation → Market & competitors (HTML and PDF). |
| DS-3.30.1-02 | CHG | Business card and email signature: removed the "Founder" title and the placeholder email and website. The name and location were later removed (DS-3.36.0-05). |

## 3.30.0 — 2026-11-04 · Complete brand system

| ID | Tag | Change |
|---|---|---|
| DS-3.30.0-01 | NEW | **Brand book:** `docs/BRAND.html` plus the PDF `docs/DesignStudio-Brand-Book.pdf` (A4, 18 pages). Sections: foundation (purpose, promise, audience, positioning, pillars, taglines), personality, voice and naming, logo, colour, typography, graphic language, iconography, motion, applications and files. |
| DS-3.30.0-02 | NEW | **Design tokens:** `brand/tokens/tokens.css` (`--ds-*` variables), `tokens.json` and `contrast.json`. Five colour scales (blue, violet, holy yellow, pearl, ink), semantic colours, type scale, spacing, radius and motion, with WCAG contrast checks. |
| DS-3.30.0-03 | NEW | **Graphic language:** the link-node network (dark, light and square) and dot grids in `brand/graphics/`. |
| DS-3.30.0-04 | NEW | **Applications** in `brand/applications/`: link preview, profile banner, social post, presentation cover, website hero, business card (front and back) and email signature. HTML sources are editable, and `tools/render-brand.mjs` renders the PNGs and the PDF. |
| DS-3.30.0-05 | NEW | **Brand fonts:** Sora 400–800 and Inter 400–700 (SIL OFL) in `brand/fonts/`. |
| DS-3.30.0-06 | CHG | **App colours aligned to the brand.** The accent is brand blue (blue-400 `#61A2FF` for text and lines, blue-600 `#2F72D6` for filled controls with white text), violet replaces purple, holy yellow is the warning and keyframe-selection colour, and selection lines and handles on the canvas are brand blue. Content defaults in user designs are unchanged. All filled-accent controls with white text now use the darker blue (AA contrast). UI font prefers Inter when installed. |

## 3.29.0 — 2026-11-04 · Wordmark colours: pearl and holy yellow

| ID | Tag | Change |
|---|---|---|
| DS-3.29.0-01 | CHG | **"studio" is now pearl** (`#F4ECD6`), a soft yellow-white, wherever the logo is on dark: top bar, splash, About and `designstudio-wordmark-on-dark.svg`. On white it stays ink (`#17171D`), because pearl doesn't show on white. |
| DS-3.29.0-02 | CHG | **The i-dots and the short-form "d" node are now holy yellow** (`#FFC21A`). The on-light file uses a deeper gold (`#F0A500`) so the dots stay visible on white. The favicon, app icons and User Guide are updated to match. |
| DS-3.29.0-03 | CHG | `docs/BRAND.html` colour palette is now: gradient, holy yellow, pearl, ink and paper. `gen.py` holds the new colour constants. |

## 3.28.0 — 2026-11-04 · Wordmark logo

| ID | Tag | Change |
|---|---|---|
| DS-3.28.0-01 | NEW | **Wordmark logo.** "designstudio" in lowercase heavy geometric letters, outlined to paths (from Sora Bold, SIL OFL 1.1, then modified). "design" carries the blue-to-violet gradient and "studio" the text colour. Both i-dots are coral link nodes that connect the two words. |
| DS-3.28.0-02 | CHG | The wordmark replaces the DS monogram. It's used in the top bar (screens 1200 px and wider), the splash (the dots pop in) and the About title (`BRAND.wordmark(h)`). |
| DS-3.28.0-03 | NEW | **Short form:** the wordmark's own "d" with a coral node (`BRAND.mark(size)`), for the favicon, app icons, narrow top bar, welcome screen and User Guide. |
| DS-3.28.0-04 | NEW | Files in `brand/wordmark/`: on-dark, on-light, white and ink wordmarks, the symbol, a small symbol and the app icon, plus `gen.py` to regenerate them. `brand/icon-*.png` are regenerated. The monogram files are removed. |
| DS-3.28.0-05 | CHG | `docs/BRAND.html` is rewritten for the wordmark: primary, short form, sizes, single colour, colour, clear space and misuse. The Sora licence is added to THIRD-PARTY-NOTICES. |

## 3.27.0 — 2026-11-04 · One brand mark: the DS monogram

| ID | Tag | Change |
|---|---|---|
| DS-3.27.0-01 | CHG | **Mascot removed.** Cubo is gone from the welcome screen, About and the brand files. The DS monogram is now the only logo everywhere. |
| DS-3.27.0-02 | CHG | The 3.24 cube emblem is retired too: one mark, no secondary symbols. `BRAND.mascot()`, `BRAND.cuboHead()` and `BRAND.cube()` are removed, along with their CSS and the `brand/mascot` and `brand/cube-*` files. |
| DS-3.27.0-03 | NEW | **Single-colour versions:** `ds-monogram-white.svg` (for brand colour, photos and video) and `ds-monogram-ink.svg` (for print). |
| DS-3.27.0-04 | FIX | The top-bar and welcome markup now contain the monogram itself, so the old layers icon no longer flashes before the app starts. |
| DS-3.27.0-05 | CHG | `docs/BRAND.html` is now a proper monogram guide: construction grid, lockups, app icon, sizes, single colour, colour, clear space, misuse and files. |

## 3.26.0 — 2026-11-04 · DS monogram logo

| ID | Tag | Change |
|---|---|---|
| DS-3.26.0-01 | NEW | **DS monogram.** The new logo is a bold D (Design) with the S (Studio) cut out of its counter, plus a coral link node on its corner. The blue-to-violet D and coral node carry the three studio colours. Original artwork. |
| DS-3.26.0-02 | CHG | The monogram is used in the top bar, splash (the node pops in), favicon, User Guide and lockups (`BRAND.mark()`, `BRAND.lockup()`). At 20 px and below a heavier S is cut so the letter stays open. |
| DS-3.26.0-03 | NEW | **App icon:** the monogram on a dark tile with a subtle rim (`brand/monogram/ds-app-icon.svg`, `brand/icon-512/192/32.png`). |
| DS-3.26.0-04 | CHG | Cubo stays as the mascot on the welcome screen and in About. Its head is now `BRAND.cuboHead()`. |
| DS-3.26.0-05 | CHG | `docs/BRAND.html` now leads with the monogram and covers the mascot, sizes, marks and where they appear, colour, clear space and misuse. `brand/monogram/gen.py` regenerates the monogram files. |

## 3.25.0 — 2026-11-04 · Mascot logo "Cubo"

| ID | Tag | Change |
|---|---|---|
| DS-3.25.0-01 | NEW | **Cubo, the mascot.** The studio cube becomes a character: Design, Media and 3D faces, a corner nose, big eyes, an antenna carrying the link node, arms and a stylus. Original artwork. |
| DS-3.25.0-02 | CHG | **Logo = Cubo's head.** Used in the top bar, favicon, app icons (512 / 192 / 32 px) and User Guide. At 20 px and below a bolder face is used. |
| DS-3.25.0-03 | NEW | **Full-body Cubo** on the splash (pops in), welcome screen and About. It waves, blinks and bobs (CSS only), and stays still with reduced motion. `BRAND.mascot(size)`. |
| DS-3.25.0-04 | CHG | The 3.24 cube emblem stays as the secondary mark (`BRAND.cube()`, `brand/cube-*.svg`). |
| DS-3.25.0-05 | NEW | Brand sheet `docs/BRAND.html` reworked around Cubo (character story, placements, sizes, colour, misuse). `brand/mascot/gen.py` regenerates every mascot file. |

## 3.24.0 — 2026-11-04 · New brand identity

| ID | Tag | Change |
|---|---|---|
| DS-3.24.0-01 | NEW | **New logo.** An isometric cube whose three faces are the three studios, Design (top, blue), Media (left, violet) and 3D (right, coral), meeting at one white link node. Used in the top bar, welcome screen, About, splash, favicon and User Guide. |
| DS-3.24.0-02 | NEW | **Wordmark.** "**Design**Studio": bold *Design*, regular *Studio*. Shown in the top bar, splash and lockups (`BRAND.lockup()`). |
| DS-3.24.0-03 | NEW | **Small-size variant.** At 20 px and below the mark drops its seams and enlarges the node so it stays readable (favicon, tabs). |
| DS-3.24.0-04 | NEW | **Splash animation.** The three faces assemble, then the node appears (0.6 s). Turned off when the system asks for reduced motion. |
| DS-3.24.0-05 | NEW | **Brand kit.** `docs/BRAND.html` (lockups, sizes, colours, clear space, misuse) and `brand/` (master SVG, small SVG, 512 / 192 / 32 px PNG icons). Both are included in the release. |
| DS-3.24.0-06 | CHG | Every logo instance gets unique gradient ids, so several logos on one page never clash. |


## v3.23.0 — “Workspace” · 2026-11-01
Fixes the four biggest pain points from `tests/UX-REPORT.md`.
- **DS-3.23.0-01 More canvas on laptops.** Drag the inner edge of the Layers or Properties panel to resize it (double-click resets, arrow keys when focused, remembered). **Ctrl+\\** — or View › Hide Side Panels, or the new *Panels* button in the status bar — hides both side panels for a full-width canvas. Animate opens a timeline sized to the screen (≈30 % of the height) instead of a fixed 300 px.
- **DS-3.23.0-02 Lottie without surprises.** The export dialog lists what Lottie can’t do natively before you export (text, imported SVG paths, shadows / blurs, with counts) and, by default, embeds those layers as images so the animation keeps its look (they still move, rotate, scale and fade with their keyframes). What still can’t be kept (effects on frames / groups) is named with a suggestion.
- **DS-3.23.0-03 AI Studio docks beside Properties.** It becomes its own resizable column; the canvas shrinks instead of being covered and the Properties panel stays usable, so you can adjust what the AI made. On screens narrower than 1560 px the Layers panel steps aside while AI is open and comes back when it closes.
- **DS-3.23.0-04 Animate explains itself.** Entering Animate turns Auto-key on (moving / resizing / recolouring the selection records a keyframe at the playhead) and restores your choice when you leave; the auto-key button now reads “Auto-key on / off”; an empty timeline shows the three steps to make an animation, ticking them off as you go.
- **DS-3.23.0-05 Fixed:** the timeline panel was positioned at the top of the canvas when the guidance overlay was added (caught in testing, never released).
- **DS-3.23.0-06 QA.** New `workspace` suite (panel resize, hide panels, AI docking, Animate guidance, Lottie warning + image layers). 148 tests.

## v3.22.0 — “Usability” · 2026-11-01
- **DS-3.22.0-01 Hard test.** Automated sweep of every command, Design-panel field, export format, Media tool, 3D field and shortcut (261 checks) plus new-user task walkthroughs; findings and open pain points in `tests/UX-REPORT.md`.
- **DS-3.22.0-02 Fixed: invisible new text.** Text was white by default and frames are white; new / pasted text now takes a colour that contrasts with what it is placed on.
- **DS-3.22.0-03 Fixed:** leaving Animate closes the timeline it opened (canvas no longer stays cramped).
- **DS-3.22.0-04 Minimap** hides while the timeline is open and can be closed / reopened (it covered the canvas on laptops).
- **DS-3.22.0-05 Media:** missing-input and limit messages (overlay image, empty Design canvas, too many frames, unsupported encoder) are clear instructions, not app errors.
- **DS-3.22.0-06 Tour** starts only from the welcome “What do you want to make?” buttons, not in the middle of a template.
- **DS-3.22.0-07** Last emoji replaced (timeline record / onion skin, AI quick actions).

## v3.21.0 — “Professional” · 2026-11-01
- **DS-3.21.0-01 Release package.** `node tools/build.mjs` builds a clean end-user folder and ZIP in `release/`: `DesignStudio.html`, one minified app script, minified stylesheet, vendor libraries, the MCP bridge, user guide, README, licence, third-party notices and changelog — no tests, tools or version history. The QA suite runs against the release build (`--app=`).
- **DS-3.21.0-02 Codebase cleanup.** Scripts organised into `js/core`, `engine`, `design`, `media`, `space3d`, `shell`, `ai`, `vendor`; dead code removed (unused 3D interaction panel, old style applier, unused helpers); lint clean (0 errors); new developer README.
- **DS-3.21.0-03 One icon set.** A consistent line-icon set replaces emoji across the welcome screen, Media tools, 3D add panel and outliner, toolbars, Links panel and toasts (emoji render differently on every OS).
- **DS-3.21.0-04 UI polish.** Single accent colour (Edit / Animate no longer purple); fill / stroke rows no longer truncate the type or hex value; linked layers named “(linked)”.
- **DS-3.21.0-05 Brand & first run.** New app mark (top bar, welcome, About, splash, favicon), launch splash, refreshed welcome with the current “What’s new”, redesigned About (tagline, facts, third-party licences, diagnostics, copyright), a 6-step guided tour after the first start (About › Take the tour any time) and a keyboard-shortcut sheet (press ?). The logo opens About.
- **DS-3.21.0-06 Fixed:** the layers panel did not refresh when a project was restored from IndexedDB after start-up.
- **DS-3.21.0-07 Docs.** `docs/USER-GUIDE.html` (offline, light / dark), end-user README, `LICENSE.txt` (© DesignStudio), `THIRD-PARTY-NOTICES.txt` (MIT licences of bundled libraries).

## v3.20.0 — “Hardened” · 2026-11-01
- **DS-3.20.0-01 Malicious project files.** Every project load (open, autosave, recent, paste, design-system import) goes through a safe JSON parser (size cap, `__proto__` / `constructor` / `prototype` keys removed) and a deep sanitiser: prototype pollution is impossible, only inline `data:image/…` images are kept (remote tracking pixels and `javascript:` URLs dropped), links with odd targets are removed, prototype / trigger links are limited to http(s) and mailto.
- **DS-3.20.0-02 Malicious 3D content.** glTF / GLB that reference external files are refused (no network fetch or local file probing from a model), also inside exported 3D viewers; 3D textures accept inline images only; a bad model in a project is skipped instead of breaking the scene.
- **DS-3.20.0-03 Decompression bombs.** Images, GIFs, animated images and Media frames are checked before decoding: max 16,384 px per side, 100 MP per image, 400 MP per animation; file size caps (project 200 MB, SVG 30 MB, image 40 MB, model 30 MB, media 200 MB / video 500 MB). SVGs with XML entity declarations (billion-laughs) are refused. Refusals show a clear message.
- **DS-3.20.0-04 Content-Security-Policy.** The app now ships a strict CSP: scripts only from the app itself (no inline or remote scripts can run even if markup were injected), no plugins / frames / forms, images and media inline only, network limited to HTTPS and this computer (AI providers, local MCP bridge). No-referrer policy.
- **DS-3.20.0-05 MCP bridge.** DNS-rebinding guard (Host must be 127.0.0.1 / localhost), web pages can never call `/mcp`, and the DesignStudio tab now pairs with the bridge (secret per session) so another page cannot impersonate it while it is connected. Bridge input lengths capped.
- **DS-3.20.0-06 Exported files.** Interactive HTML and 3D viewer runtimes refuse non-http(s)/mailto links.
- **DS-3.20.0-07 QA.** New `malicious` suite (16 tests) feeds real attack files through the real file inputs (fixtures in `tests/fixtures/malicious/`) and checks no request ever reaches the attacker host. 139 / 139 pass.

## v3.19.0 — “Any device” · 2026-10-31
- **DS-3.19.0-01 Touch.** Design canvas: one finger uses the current tool, two fingers pinch-zoom and pan (a short hold tells a drag from a pinch), long-press opens the context menu, double-tap = double-click; selection handles get finger-sized hit areas; larger buttons on touch screens (pointer: coarse). Page zoom / scroll no longer steals gestures from the canvas, rulers, timelines, 3D view or Media stage. 3D orbit works with touch.
- **DS-3.19.0-02 Pen / stylus.** Pen works like a mouse (hover, drawing) with palm rejection — touches on the canvas are ignored while a pen is in use; barrel button opens the context menu.
- **DS-3.19.0-03 Safari & Firefox.** Canvas filter polyfill (Safari before 18): blurs, drop/inner shadows, background blur, Media effects and censor blur render the same as in Chromium. Text letter-spacing drawn manually where canvas letter-spacing is missing (Firefox, older Safari). Links panel width no longer depends on CSS :has() (Firefox ESR). Compatibility lint (eslint-plugin-compat, Firefox 115+, Safari 16.4+, Edge/Chrome 110+): only WebCodecs remain, already feature-detected with fallbacks.
- **DS-3.19.0-04 QA.** New suites: touch (real multi-touch and pen via DevTools) and compat (Safari / Firefox code paths forced in Chromium). `node tests/qa.js --browser=firefox|webkit` runs everything in the Firefox and WebKit engines. 127 / 127 pass in Chromium.

## v3.18.0 — “Production QA” · 2026-10-31
- **DS-3.18.0-01 QA suite.** `tests/qa.js` (Playwright + axe-core): 111 automated tests in 16 suites — boot, unit, design (real mouse/keyboard), persistence, animation/prototype, exports (SVG, animated SVG, PNG, Lottie, code, interactive HTML run in a browser), media, 3D (primitives, undo, keyframes, dope sheet, guides, GLB, viewer run in a browser), links, comments, security (XSS sweeps), robustness (corrupt data, 2,000 layers, spam, storage failure), monkey (600 random actions), accessibility, responsive (390–1920 px), performance. Static lint (ESLint) clean of errors. Result: 111 / 111 pass; last run in `tests/last-run.txt` (a fresh `node tests/qa.js` writes `tests/report.json`).
- **DS-3.18.0-02 Fixed: XSS in the 3D timeline.** An animation name containing HTML was rendered unescaped in the dope-sheet header.
- **DS-3.18.0-03 Fixed: adding a 3D object right after the 3D engine started** could fail (“Cannot read properties of undefined (reading 'add')”) — it now waits for the first scene build.
- **DS-3.18.0-04 Fixed: top bar clipped on 1280–1365 px laptops** (Export button cut off). Compact layout below 1366 px (icon-only Edit/Animate, shorter title, save dot); below 860 px the bar scrolls instead of clipping.
- **DS-3.18.0-05 Accessibility.** 3D timeline tree only exposes role="tree" when it has items (axe aria-required-children). App icon added.
- **DS-3.18.0-06 Cleanup.** Removed a no-op self-assignment and unused variables found by lint.

## v3.17.1 — “3D in Design” · 2026-10-30
- **DS-3.17.1-01 Adjust linked 3D layers in Design.** Selecting a layer linked from 3D adds a “🧊 3D” card to the Design panel: live preview (drag = orbit, Shift+drag = turn the object, wheel = zoom), view presets (Front, ¾, Side, Back, Top, Low), rotation X/Y/Z, scale, colour, metalness, roughness, pose at time (when 3D is animated), transparent background, render size (800 / 1600 / 2400 px), Update, Unlink, ↗ open in 3D. The 3D engine starts in the background — no need to open the 3D tab.
- **DS-3.17.1-02 Adjust on canvas.** Double-click a linked 3D layer (or ✥ Adjust on canvas) to orbit / turn / zoom it right on the Design canvas; Esc, Enter or click outside to finish. Object edits are real 3D scene edits (undoable in 3D) and the layer re-renders live.

## v3.17.0 — “Linked Studio” · 2026-10-30
- **DS-3.17.0-01 Dynamic links.** Content made in one tab can be used in another and stays in sync: 3D view or a 3D object → Design image layer (re-renders after every 3D edit, transparent background, objects auto-framed); Media frame → Design layer or 3D image plane (updates after every Media edit); Design layer / frame → 3D image plane (updates after every Design edit — e.g. a UI screen on a 3D card or phone); Design layer → Media (copy, to compress / convert).
- **DS-3.17.0-02 Links panel.** 🔗 in the top bar (with a count) works in every tab: create links from the current selection, see every link with its status, Update / Update all, jump to Source or Target, Auto on/off, Unlink (the layer keeps its last image). Shortcuts: ⇄ To Design in the 3D toolbar, ⇄ Use in… in the Media toolbar. Double-click a linked layer in Design to edit its source.
- **DS-3.17.0-03 3D image textures.** 3D objects can show an image (unlit plane for linked content); also works in the exported 3D viewer. Links and textures are saved in the project.

## v3.16.2 — “Comments everywhere” · 2026-10-30
- **DS-3.16.2-01 Comments in Media and 3D.** The Comments button (C) was Design-only and did nothing elsewhere. Media: click the frame to pin a comment to a source pixel (remembers the frame; pins follow zoom). 3D: click an object to pin a comment to its surface — it follows the object when it moves or animates — or empty space for a point at the target depth; orbit / zoom keep working while commenting. Each section's drawer lists its own comments; Esc exits. Saved in the project and listed in the share package (Media / 3D scene).

## v3.16.1 — “Modes per section” · 2026-10-30
- **DS-3.16.1-01 Edit ↔ Animate in Media and 3D.** The switch no longer jumps to Design. Media › Animate shows the frame strip, opens the animation tools (Animation maker / Frame delays & loop) and hides still-image-only tools; Media › Edit shows every tool. 3D › Animate opens the dope sheet and turns Auto-key on; 3D › Edit turns Auto-key off, pauses and folds the dope sheet. Each section remembers its own mode and the switch shows it.

## v3.16.0 — “Rulers Everywhere” · 2026-10-30
- **DS-3.16.0-01 Top bar works in every section.** Media: zoom − / + (10 %–1600 %, click % to fit), Grid = pixel grid on the frame, Snap = snap guides and crop / region drawing to guides, grid and edges, Timeline = show / hide the frame strip, Play = play the clip. 3D: camera zoom, 3D grid, snap, dope sheet, playback (v3.15.0). Only the Edit / View / Object menus and Edit ↔ Animate open Design.
- **DS-3.16.0-02 Media rulers & guides.** Pixel rulers on the media stage (frame span highlighted). Drag from a ruler for a guide; drag guides to move (snap to grid / edges / centre, Alt = free); drag onto a ruler, right-click or Delete to remove. ⌗ corner: rulers, pixel grid, grid size, snap, centre guides, clear.
- **DS-3.16.0-03 3D rulers & guides.** World-unit rulers on the 3D viewport (X / Y, switching to Z for side and top views; the corner shows which). Drag from a ruler to drop a colour-coded guide plane (X red, Y green, Z blue). Objects moved with the gizmo snap their edges and centre to guides. 📐 Guides menu (3D toolbar or ⌗ corner): rulers on/off, snap, add X / Y / Z guide through the selection, edit or delete guides, clear. Guides are saved in the project.

## v3.15.0 — “One Shell” · 2026-10-30
- **DS-3.15.0-01 Shared top bar.** The full top bar (Edit / View / Object menus, Edit ↔ Animate, zoom, Grid, Snap, Timeline, Play) now stays visible in Design, Media and 3D. In 3D it drives the viewport: zoom ± moves the camera (readout in %, click = frame selection), Grid / Snap toggle the 3D grid and snap, Timeline shows / hides the dope sheet, Play plays the 3D animation (or stops Preview). Design-only actions switch to Design and run.
- **DS-3.15.0-02 Movable dialogs.** Drag any dialog or popover (Export, About, confirmations, Design System, curve editor, colour picker, AI drawer…) by its title bar or top edge to anywhere on screen; double-click the title bar to re-center. Positions are remembered for the session, also when a dialog is opened again.

## v3.14.0 — “3D Timeline” · 2026-10-30
- **DS-3.14.0-01 Dope sheet.** The 3D scrub bar is now a resizable timeline: object rows (merged keys) that expand into property tracks, ruler in seconds or frames (click the time readout), red playhead, zoom (Ctrl/Alt + wheel), scroll, fit, collapse. Height, units and snap are remembered.
- **DS-3.14.0-02 Key editing.** Click / Shift / Ctrl-click / marquee to select keys; drag to retime (snaps to frames, Alt = free); ← → nudge 1 frame (Shift = 10); Ctrl+C / X / V / D copy, cut, paste at the playhead (retargets to the selected object), duplicate; Delete; Ctrl+A; Reverse order; right-click menu for everything. Double-click a track to add a key; ◆ per track toggles a key at the playhead.
- **DS-3.14.0-03 Easing.** Ease picker for selected keys with 13 curves (adds Sine, Expo, Back in-out, Bounce, Elastic, Hold) and a **custom cubic-bezier curve editor** with presets and a live preview. Key shapes show the easing (diamond = linear, round = eased, square = hold). Exported 3D viewers play the same curves.
- **DS-3.14.0-04 Shape keys & morph targets.** ＋ Track keys any property: transform, material (colour, opacity, emissive, metalness, roughness), light (intensity, colour), **geometry parameters of primitives** (width, height, radius, thickness…) and **morph targets of imported models**. Editing a shape field with a track keys it at the playhead.
- **DS-3.14.0-05 Playback.** Loop / Ping-pong / Once, speed 0.25×–2×, frame rate (12–60 fps), play range in / out (I / O, or right-click the ruler), prev / next key (J / L), step frame (, .), Home / End. Animation menu: rename, duplicate, delete.

## v3.13.1 — “Handles & Animated SVG” · 2026-10-30
| ID | Type | Change |
|---|---|---|
| DS-3.13.1-01 | FIX | **Arrow and line ends were hard to grab** (tiny square handles, 6 px hit area). Ends now have large round handles with a 10 px grab area. You can drag an end of any line or arrow straight away, even when it isn't selected (the cursor turns into a crosshair over an end) |
| DS-3.13.1-02 | NEW | **Ends snap** to corners, edge middles and centres of other layers, and to other line ends (red ring). A tooltip shows the length and angle. Shift = 45° steps; Alt = no snapping |
| DS-3.13.1-03 | NEW | **Curve handle** in the middle of a selected line or arrow: drag it to bend the line (it snaps back to straight near the middle; Shift = steps of 10). Lines no longer show a box and size label, so curved arrows stay clean |
| DS-3.13.1-04 | NEW | **Edit points of any shape**: double-click a rectangle, ellipse, polygon or star to turn it into a vector and drag its points (as in Figma; Esc when done, one undo step). Point handles are bigger and easier to grab (10 px) |
| DS-3.13.1-05 | NEW | **Export › Animation › Animated SVG**: one .svg file with CSS keyframes from the active timeline. Position, rotation, size, opacity (which covers a whole group, as on the canvas) and fill color are kept, with easing and Loop / Ping-pong / Once. Plays in browsers, `<img>` tags and websites, with no JavaScript, and respects “reduce motion” |
| DS-3.13.1-06 | KNOWN | Animated SVG doesn't include corner-radius animation or effects that change over time; use Video or Lottie for those |

## v3.13.0 — “Arrows & Presets” · 2026-10-30
New toolbar icons, arrow heads and presets, and one-click design system presets.

| ID | Type | Change |
|---|---|---|
| DS-3.13.0-01 | CHG | **New toolbar icons** for Scale (box with a resize arrow), Frame (#, as in Figma), Pen (nib) and Eyedropper (pipette): line icons that match the rest of the toolbar |
| DS-3.13.0-02 | NEW | **Arrow heads on either end**: None, Triangle, Stealth, Chevron (open), Dot, Open circle, Square, Diamond, Open diamond, Bar. Lines can get heads too |
| DS-3.13.0-03 | NEW | **Line style & shape**: Solid / Dashed / Dotted, **Curve** (−100…100, bends either way, heads follow the curve), **Head size** (0.5–3×), **Swap** start and end |
| DS-3.13.0-04 | NEW | **16 arrow presets** with live previews (Design panel › Arrow): Arrow, Double, Stealth, Chevron, Dot → arrow, Connector, Open circle, Dashed flow, Dotted, Curved, Curved double, Swoosh, Dimension, Aggregation, Composition, Bold. With the Arrow tool (Shift+L) active, picking a preset sets the style for new arrows (remembered) |
| DS-3.13.0-05 | NEW | Arrow styles export to SVG (heads, curves, dashes), and are kept by save, undo and copy |
| DS-3.13.0-06 | NEW | **Design system presets** (Design system › Tokens & code › Presets): Kova Fintech, Material-style, iOS-style, SaaS Clean, Mono Minimal, Warm Commerce, Health Calm, Neon Gaming. Each adds a brand + neutral palette (50–900), status colors, Light/Dark semantic tokens, spacing, radius, a type scale (with its own font), shadow/glow styles and a Button component set bound to the tokens. One undo step; existing tokens with the same names are updated |
| DS-3.13.0-07 | KNOWN | A curved line's selection box covers the straight line between its ends; click near the ends or in the Layers panel to select a strongly curved arrow |

## v3.12.0 — “AI Apps” · 2026-10-30
AI apps such as Claude Desktop, Claude Code, Cursor and VS Code can now work with the open DesignStudio file over MCP: they read it, see screenshots, write code from it and make changes you can undo. One-time setup is a double-click (Claude Desktop, Cursor) or one command (Claude Code). Everything stays on this computer.

| ID | Type | Change |
|---|---|---|
| DS-3.12.0-01 | NEW | **MCP bridge** `mcp/designstudio-mcp.mjs`: a single file with no dependencies (needs Node.js 18+). It is a stdio MCP server for AI apps, plus `http://127.0.0.1:3845/mcp` for apps that take a URL. Several apps can connect at once: later ones share the first bridge, and take over if it quits |
| DS-3.12.0-02 | NEW | **One-click setup**: `Connect-Claude-Desktop.cmd`, `Connect-Cursor.cmd` (adds DesignStudio to the app's config, keeps your other servers and makes a `.bak` backup), `Check-Connection.cmd`, and `--install claude-code / vscode / print` |
| DS-3.12.0-03 | NEW | **✦ AI › AI apps** tab (also View › AI apps, Ctrl+Alt+M): an on/off switch, **Read only / Read & edit**, **Ask me before each change**, live connection status with the connected apps' names, setup snippets filled in with your real folder path and copy buttons, example prompts, and recent requests with *Undo last change*. The status bar shows **● AI apps** while connected |
| DS-3.12.0-04 | NEW | **10 tools for AI apps**: `get_document`, `get_selection`, `get_node`, `find_nodes`, `get_screenshot` (PNG), `get_code` (HTML / React / Vue / Svelte, CSS or Tailwind, SVG), `get_design_system` (variables, styles, components, W3C tokens), `apply_operations` (validated first; all or nothing), `select_nodes`, `get_scene3d` |
| DS-3.12.0-05 | NEW | **Safety**: the bridge listens on 127.0.0.1 only and refuses requests from websites (Origin check). It's off until you turn it on, read-only blocks every change, and each change shows a toast with Undo |
| DS-3.12.0-06 | FIX | **AI changes took more than one Ctrl+Z** when they placed component instances or created components (those steps made their own undo entries). Every AI change, from AI Studio or an AI app, is now exactly one undo step |
| DS-3.12.0-07 | KNOWN | AI apps work with the copy of DesignStudio opened from `index.html` on your computer. The hosted web copy can't reach the local bridge |
| DS-3.12.0-08 | KNOWN | AI apps edit the current page; 3D scenes are read-only for AI apps for now |

## v3.11.2 — “3D Landing” · 2026-10-27
| ID | Type | Change |
|---|---|---|
| DS-3.11.2-01 | NEW | **3D › Scene › Viewer › Show input controls**: turn off the inputs bar at the bottom of the exported *Interactive 3D HTML*, so the export can be used as a finished page (for example, when inputs only drive cursor tilt or drag-to-spin). On by default, as before |

## v3.11.1 — “Smooth Prototypes” · 2026-10-27
Prototypes now play smoothly, like Figma's player. Measured on the Kova fintech hero: one frame took 132 ms to draw (about 7 fps); now it takes 28 ms in software rendering, and it's faster again on a GPU. Frames are only redrawn when something changes.

| ID | Type | Change |
|---|---|---|
| DS-3.11.1-01 | FIX | **Layer blur was re-rendered on every frame** (about 85 % of the drawing time with large glows). A blurred layer is now drawn once, on a smaller canvas, and reused while its look and size stay the same. Moving it (animation, parallax) only re-places the image. Also faster on the editor canvas |
| DS-3.11.1-02 | FIX | **Background blur blurred the whole canvas** for every glass card on every frame. It now blurs only the area under the shape (on a smaller copy for big blurs) |
| DS-3.11.1-03 | FIX | **Fading a frame or group** (opacity below 100 %) created a new full-screen canvas on every frame. These canvases are now reused |
| DS-3.11.1-04 | FIX | **The prototype player redrew every frame**, even when nothing moved. It now redraws only when an animation, trigger or state machine changes something |
| DS-3.11.1-05 | FIX | **Intro animations flashed**: the first frame showed the finished design, then jumped back to the animation's start. *Start → Play animation* now shows its first frame before the screen appears (also in exported players) |
| DS-3.11.1-06 | NEW | **Scrolling like Figma**: scrollable screens hide their scrollbars and can be scrolled by click-and-drag, even when the drag starts on a button. A drag never counts as a click |

## v3.11.0 — “Frames & Guides” · 2026-10-27
Figma-style frame creation, working ruler guides, and a fix for buttons with hover / press states in the prototype preview. The project folder was also tidied up (see *Housekeeping*).

| ID | Type | Change |
|---|---|---|
| DS-3.11.0-01 | NEW | **Ruler guides**: drag from the top ruler for a horizontal guide, from the left ruler for a vertical one. While dragging, the guide snaps to the selection and frame edges/centres (Shift = steps of 10) and shows its position. Dropped over a top-level frame, it belongs to that frame (moves with it, spans only the frame, value relative to it); elsewhere it spans the page |
| DS-3.11.0-02 | NEW | **Edit guides on the canvas**: hover a guide to drag it, click to select it (Delete removes it), or drag it back onto its ruler to remove it. Guides are saved with each page and can be undone |
| DS-3.11.0-03 | NEW | **Snap to guides**: layers snap to guides while moving and resizing (guides win ties over layer edges). View › **Guides** (Ctrl+;), **Lock Guides** (Ctrl+Alt+;), **Clear Guides on Page** |
| DS-3.11.0-04 | NEW | **Rulers show the selection's start / end values** (blue labels) and a mark for every guide; the hovered or selected guide shows its value |
| DS-3.11.0-05 | FIX | **Button preview**: a button with *While pressing* / *While hovering → Change to* (pressed / hover variants) never ran its *On click* action (e.g. Navigate), because each state change rebuilt the whole screen and the click was lost. State changes now update the screen in place: the click lands, scroll position is kept, the rest of the screen no longer flashes, and only the button animates (Smart animate / Dissolve tween its layers). Also works inside overlays |
| DS-3.11.0-06 | FIX | **Leaving a button while still pressing it** could leave it stuck on its Hover variant (the states ended in the wrong order). It now returns to Default |
| DS-3.11.0-07 | NEW | **Frame tool presets (Figma style)**: press F and the Design panel lists frame sizes (Phone, Tablet, Desktop, Presentation, Watch, Paper, Social media) with search. Click one to add that frame to the right of your work (named after the preset, selected and brought into view), or drag on the canvas for any size (Shift = square, Alt = from centre, click = 100×100) |
| DS-3.11.0-08 | NEW | **Selected frame**: a size-preset menu, **Portrait / Landscape** switch and **Resize to fit** (frame hugs its contents; auto-layout frames switch to Hug) in the Transform section. Resizing respects constraints, the same as typing W / H |
| DS-3.11.0-09 | CHG | **Housekeeping**: removed the duplicate `_versions` folder that had been copied inside v3.10.1, moved v3.10.0 back into `_versions`, merged the two half-copies of v3.6.0 (`v3.6.0` + `v3.6 (1).0`), and the root folder is again a complete copy of the current version (the old partial root files were moved to `_backup/root-before-3.11.0/`) |
| DS-3.11.0-10 | KNOWN | Guides inside nested frames attach to the top-level frame; guides on rotated frames are not supported |
| DS-3.11.0-11 | KNOWN | `_versions/v3.6.0` is still missing `index.html`, `model.js` and a few other files — they were never saved in either half-copy |

## v3.10.1 — “QC” · 2026-10-27
Quality check from three angles (UI/UX, product, project). Every screen was audited at 1440, 1280 and 1024 px wide with automated accessibility checks (WCAG 2 A/AA), layout-overflow checks and a 2,000-layer performance test, plus the full regression run.

| ID | Type | Change |
|---|---|---|
| DS-3.10.1-01 | FIX | **Top bar at ≤ 1100 px**: the new save status pushed **Export** off-screen. The status collapses to its coloured dot (details on hover/click); Edit/Animate show icons only |
| DS-3.10.1-02 | FIX | **Fill / Opacity rows cut off** in a narrow inspector (the ✕ and variable buttons were hidden at 1024 px) — rows now shrink to fit |
| DS-3.10.1-03 | FIX | **Accessibility**: every field now has a spoken name (X, Y, W, H, timeline, 3D panel…), the menu bar, layer tree and state-machine list use valid roles, and 7 low-contrast texts were raised to AA (timeline meta, design-system labels, Close Preview, Media tools). Automated audit: 0 issues on 12 of 13 screens |
| DS-3.10.1-04 | FIX | **Animation names were truncated** (“Timelin…”) — full name on hover, and Duplicate / Delete appear on hover so the name gets the room |
| DS-3.10.1-05 | KNOWN | Disabled export icons in Media (before a file is loaded) are below 4.5 : 1 — allowed for inactive controls |
| DS-3.10.1-06 | KNOWN | Keyframe diamonds in the Transform panel are 14 px targets (WCAG 2.2 suggests 24 px) |

## v3.10.0 — “Autosave & Properties” · 2026-10-26
Auto-save to your project file with a live save status, and component properties that work like Figma’s. Includes the variables / gradients / states fixes from the last QA round.

| ID | Type | Change |
|---|---|---|
| DS-3.10.0-01 | NEW | **Save status next to the project title**: *Saving…* → *Saved · just now* (updates to “2 min ago” etc.), amber *Not saved to file* / *Resume auto-save*, red *Not saved — retry*. Click it for where you’re saving, last save time, Save now / Save as / Download copy and an **Auto-save to file** switch |
| DS-3.10.0-02 | NEW | **Auto-save to the project file**: after you Save (Ctrl+S) or Open a project once, every change is written to that same file automatically (Chrome / Edge). Rapid edits are combined into one write; your work is also always kept in the browser as a safety copy |
| DS-3.10.0-03 | NEW | **The file link survives a reload** — one click on *Resume auto-save* re-grants permission. Write failures (file moved, read-only, permission removed) show a clear message and a toast once; saving resumes by itself when it works again |
| DS-3.10.0-04 | NEW | **Create component properties from a layer** (Figma style): select a layer inside a main component → *Component properties* at the top of the Design panel → **◇ Create property** for its text, visibility or nested instance, or **Apply…** an existing one. The new property’s name is focused so you can type its name right away; ⊘ detaches it |
| DS-3.10.0-05 | NEW | **Properties panel on the main component / variant set**: ＋ menu (Variant · Boolean · Instance swap · Text), editable **default value** (writes the main’s layer), **Applied to** chips (one property can drive several layers; ✕ to detach, ＋ Layer… to add), delete |
| DS-3.10.0-06 | NEW | **Variant properties in the same list**: rename a variant property (renames it on every variant) and ＋ Variant adds a new one to all variants |
| DS-3.10.0-07 | FIX | **Renaming a layer broke its property** (bindings were by layer name) — properties now follow renamed / moved layers |
| DS-3.10.0-08 | CHG | A property’s default always mirrors the main component’s value; editing the default never overwrites values set on instances |
| DS-3.10.0-09 | FIX | **State machine: new states appeared off-screen** in a small graph, so they couldn’t be connected. New states go into the first free spot you can see (and scroll into view); new state machines use a compact layout |
| DS-3.10.0-10 | FIX | **Variables**: re-binding a property to a different variable could keep the old value until the next edit; styles had the same issue |
| DS-3.10.0-11 | FIX | **Gradients**: fill rows in gradient mode showed a variable button that replaced the gradient with a solid colour; switching Solid ↔ Gradient while typing in a field no longer edits the wrong fill |
| DS-3.10.0-12 | FIX | **Prototype “Change to” on hover / press**: the temporary variant now keeps the original variant’s interactions, so leaving / releasing returns to the original state reliably |
| DS-3.10.0-13 | KNOWN | Auto-save straight into a file needs Chrome or Edge (File System Access). Other browsers keep the browser copy and use Download copy |

## v3.9.2 — “Components QA” · 2026-10-16
Components tested end to end like a designer uses them (53 checks: create, place, main → instance updates, overrides, detach / delete / restore, variants, properties, nesting, auto layout, undo, save, export) — every bug found is fixed.

| ID | Type | Change |
|---|---|---|
| DS-3.9.2-01 | FIX | **Editing the wrong layer**: after typing a colour (or any value in Fill / Stroke / Effects / Layout-grid lists) and pressing Enter, selecting another layer kept the old fields — the next edit changed the *previous* layer. Lists now always follow the current selection. This is why instance overrides looked “ignored” |
| DS-3.9.2-02 | FIX | **Instance edits right after Undo / Redo or opening a file were reverted** to the main component. Overrides are now recognised immediately |
| DS-3.9.2-03 | FIX | **Ctrl+D on a main component** made an instance whose layers weren’t linked (they could double up on the next update) — now a clean, linked instance |
| DS-3.9.2-04 | FIX | **Copy + paste of a main component** pasted an unlinked copy — it now pastes an instance (as in Figma) |
| DS-3.9.2-05 | FIX | **Alt-drag of a selected frame / main component** started a marquee when grabbed from inside — selected frames can now be dragged (and Alt-dragged into an instance) from anywhere inside them |
| DS-3.9.2-06 | FIX | **Ctrl+D on a variant** created an instance inside the variant set — it now adds a new variant |
| DS-3.9.2-07 | FIX | **Typing into (or hiding) a layer linked to a component property** was reverted — it now updates the instance’s property value |
| DS-3.9.2-08 | NEW | **Prototype links on a main component are inherited** by its instances (instances can still override them) |
| DS-3.9.2-09 | NEW | **Restore main component** for instances whose main was deleted (Design panel): rebuilds it next to the instance and relinks every orphan instance |
| DS-3.9.2-10 | KNOWN | Layers inside an instance can’t be moved (structure follows the main component, as in Figma) |

## v3.9.1 — “QA” · 2026-10-16
Full QA pass: every trigger event and action in all 5 places they run (Design preview, Prototype player, exported HTML, 3D preview, exported 3D viewer), the trigger editor and all recipes, every command, panel, preview and export format. 337 automated checks + 25 feature suites, all passing.

| ID | Type | Change |
|---|---|---|
| DS-3.9.1-01 | FIX | **“Play animation” triggers did nothing** when the loop was “Once”: the player counted the first frame as the end. Fixed in every player (preview, prototype, exports, 3D) |
| DS-3.9.1-02 | FIX | **Double click** was swallowed right after clicking another layer in the same frame (the shared parent frame counted as “same target”) |
| DS-3.9.1-03 | FIX | **Trigger vanished from the layer’s panel** when its event was changed to a global one (Key, Cursor, Scroll, Input change, Animation end). Triggers now stay listed on the layer they were made on |
| DS-3.9.1-04 | FIX | **Start / After delay / Every on a layer never fired** (they fire when a screen opens). Switching to them now targets the layer’s frame automatically |
| DS-3.9.1-05 | FIX | **Timers ran slow on slow devices**: After delay, Every, Long press and camera moves now follow real time, not frame count; repeats no longer drift |
| DS-3.9.1-06 | FIX | **Long press released between two slow frames was lost** — it now fires on release |
| DS-3.9.1-07 | FIX | **Swipe and double click timing** use the wall clock, so they work at low frame rates |
| DS-3.9.1-08 | FIX | **3D: dragging or swiping an interactive object rotated the camera** (preview and exported viewer). Gestures on objects with triggers no longer orbit |
| DS-3.9.1-09 | FIX | “Go to frame” trigger transitions Slide / Push fell back to Dissolve; it now offers Instant, Dissolve, Smart animate, Move in, Push, Slide in + direction (same engine as prototype links) |
| DS-3.9.1-10 | CHG | “Play animation” recipes pick an animation that moves the layer (or any with keyframes) instead of an empty timeline, and say so when none exists |
| DS-3.9.1-11 | CHG | The “Add to current value” option is renamed **“Offset from original value”** — what it always did (hover lift and parallax rely on it) |
| DS-3.9.1-12 | KNOWN | Exported interactive HTML shows the whole page: “Go to frame / Back / Overlay” actions work in the Prototype player, not in that export |

## v3.9.0 — “AI Studio” · 2026-10-16
An AI playground that designs on the canvas, connects to any model or MCP server from one pasted key or link, and heals itself and your project.

| ID | Type | Change |
|---|---|---|
| DS-3.9.0-01 | NEW | **AI Studio** drawer (✦ AI in the top bar, View › AI Studio…, Ctrl+Alt+I): Playground · Connections · Doctor · Activity |
| DS-3.9.0-02 | NEW | **Playground**: chat that knows your selection, frames, variables, text styles and components. It creates and edits layers, auto layout, tokens, bindings, text styles, components and prototype links. Every change shows up as a preview first (“Apply to canvas” / Discard / Show JSON), and one Ctrl+Z undoes it |
| DS-3.9.0-03 | NEW | Quick actions: Generate screen, Edit selection, Critique, Write copy, Tokens, Code (code blocks with Copy / Download), Fix issues |
| DS-3.9.0-04 | NEW | **Connections from one field**: paste a key or link and it’s detected and tested — Claude (sk-ant-), OpenAI (sk-), Gemini (AIza), OpenRouter (sk-or-), Groq (gsk_), xAI, Ollama / LM Studio (localhost), any OpenAI-compatible URL, MCP servers (…/mcp). Models are discovered and the best one picked |
| DS-3.9.0-05 | NEW | **MCP tools**: Streamable-HTTP client (JSON and SSE replies, sessions). The AI can call tools mid-task (asks first unless “Run tools without asking”); “Try a tool…” runner |
| DS-3.9.0-06 | NEW | **Self-healing router**: errors are classified (key, quota, model, rate limit, overload, network, CORS, timeout); retries use backoff with Retry-After; an unavailable model is swapped for an available one; on failure it falls back to the next connection (drag priority ↑); offline assistant as last resort |
| DS-3.9.0-07 | NEW | **Self-correcting answers**: broken JSON is repaired (missing quotes, trailing commas, cut-off answers), and invalid operations are sent back to the model to fix (up to 2 rounds) before you see them |
| DS-3.9.0-08 | NEW | **Connection auto-fixes**: normalizes pasted URLs (adds https, strips /chat/completions), tries /v1 and /mcp, re-picks models, explains CORS / local-server setup; status dot per connection, red dot on ✦ AI when something breaks |
| DS-3.9.0-09 | NEW | **Doctor** (also runs when a project opens): AI connections, runtime errors (with “Ask AI to diagnose”), design-system health, prototype links to deleted frames, deleted starting frame, triggers on deleted layers, zero-size and empty text layers, far-off layers, missing images, WCAG contrast (fixes to a text token). “Fix all” in one undo step |
| DS-3.9.0-10 | NEW | **Offline assistant** (no key needed): login screen, pricing, navbar, card, “design system #hex”, dark/light mode for the selected frame, /doctor |
| DS-3.9.0-11 | NEW | Activity log: every request (model, time, tokens), retry, failover and auto-repair; copy / clear |
| DS-3.9.0-12 | CHG | Keys stay in this browser only (optionally just for the session); they are never written to project files, versions, exports or share packages. “Forget all keys” |
| DS-3.9.0-13 | FIX | **Text tool lost the first letters typed** right after clicking (they triggered tool shortcuts like H, E, L while the editor was still getting focus). The editor now focuses at once, and stray keys are routed into it |
| DS-3.9.0-14 | FIX | AI drawer keeps keyboard focus in the message box after sending, so Esc closes it as expected |
| DS-3.9.0-15 | KNOWN | Browsers block some AI/MCP servers that don’t allow cross-origin requests (CORS) — the Doctor explains the fix; streaming replies and image input are not supported yet |

## v3.8.0 — “Design System” · 2026-10-16
Variables, linked styles and the component library are managed in one place, and changes flow to every layer that uses them.

| ID | Type | Change |
|---|---|---|
| DS-3.8.0-01 | NEW | **Variables**: collections × modes (Light/Dark, brands…), types Color · Number · String · Boolean, “/” groups, aliases (⤳ another variable), usage counts. Starter “Tokens” collection included |
| DS-3.8.0-02 | NEW | **Apply variables in the Design panel**: ⬡ next to Fill, Stroke, Radius, Opacity, W/H, Gap, Padding, Font size, Line height, Letter spacing, and text content. Bound fields show a purple chip; click to change, ✕ to detach; “Create variable from this value” |
| DS-3.8.0-03 | NEW | **Variable modes per frame / instance** (Design panel › Variable modes): children follow; instances can use a different mode than their main component without becoming overrides |
| DS-3.8.0-04 | CHG | **Styles are linked, not copied**: applying a color/text/effect style from Assets links it; editing the style updates every user. A “🔗 Color style: …” chip shows the link with Edit / Detach. Color styles can follow a variable |
| DS-3.8.0-05 | CHG | Typing a value by hand into a bound property detaches it (as in Figma), the rest of the bindings stay |
| DS-3.8.0-06 | NEW | **Design System manager** (View › Design System…, Ctrl+Alt+D, or Assets › ⬡ Design system): Variables table editor, Styles editor (font, size, weight, line, tracking), Components library (thumbnails, descriptions, instance counts, go to / select instances / new instance) |
| DS-3.8.0-07 | NEW | **Health**: token coverage score and one-click fixes — hard-coded colors → bind to the matching token (picks text vs surface tokens), unlinked text matching a style, deleted variables/styles, broken or looping aliases, missing mode values, duplicate names, orphan instances, unused variables |
| DS-3.8.0-08 | NEW | **Tokens & code**: export W3C design tokens JSON (modes included), CSS custom properties (modes as [data-*] selectors, text classes), Tailwind config; import tokens JSON (Tokens Studio / Style Dictionary) with references → aliases |
| DS-3.8.0-09 | NEW | **Generate a starter system** from one brand color: brand + neutral scales, Light/Dark semantic tokens, spacing & radius, 5 text styles and a token-bound Button component set (Primary / Secondary) |
| DS-3.8.0-10 | NEW | **Releases**: list of changes since the last release (added / changed / removed), semantic version suggestion (removals → major), notes, history, restore tokens from an earlier release |
| DS-3.8.0-11 | NEW | Inspect tab shows the tokens a layer uses as `var(--…)` |
| DS-3.8.0-12 | KNOWN | Gradient stops can’t be bound to variables yet; bound values on animated layers are not auto-detached while scrubbing |

## v3.7.0 — “Prototype” · 2026-10-16
Prototyping now works like Figma: wire screens on the canvas, edit each link in a floating Interaction panel, and every trigger and animation plays correctly.

| ID | Type | Change |
|---|---|---|
| DS-3.7.0-01 | NEW | **Canvas wiring** (Prototype tab): connections drawn as blue arrows; drag a layer’s **⊕ handle** onto a frame to link it (On click → Navigate to); drag a selected arrow’s end to retarget; click an arrow to edit; Delete removes it (with Undo) |
| DS-3.7.0-02 | NEW | **Floating Interaction panel** next to the arrow: Trigger · Action · Destination · Animation (direction, easing with live preview, duration) · Overlay options · collapsible State; ＋ adds another interaction, tabs switch between them; follows pan/zoom |
| DS-3.7.0-03 | NEW | Triggers: Mouse enter, Mouse leave, While pressing, Key / gamepad (press the key to record it) — plus On click, On drag (drag direction steers directional animations), While hovering, After delay |
| DS-3.7.0-04 | NEW | Actions: Change to (component variant), Scroll to, Swap overlay, Close overlay; Open link can open in the same tab |
| DS-3.7.0-05 | NEW | Animations: Smart animate (layers with the same name path tween position, size, rotation, opacity, radius and colour), Move in, Move out, Push, Slide in, Slide out — all four directions; 10 easings |
| DS-3.7.0-06 | NEW | Overlays: 9 positions, “Close when clicking outside”, background on/off; overlays animate in with the chosen easing |
| DS-3.7.0-07 | NEW | State › Preserve scroll position; Back plays the reverse animation and restores the previous screen’s scroll |
| DS-3.7.0-08 | NEW | “▶ Flow 1” starting-point badge on the canvas plays the prototype; ⚡ trigger navigations shown as dashed amber arrows |
| DS-3.7.0-09 | CHG | Prototype tab: compact interaction rows (“On click · Navigate to Detail · Push”) open the panel; Interactions listed above ⚡ Triggers; rows missing a destination are flagged |
| DS-3.7.0-10 | FIX | **While hovering → Navigate never returned** (the hover area vanished with the old screen); hover and press now revert reliably by tracking the pointer |
| DS-3.7.0-11 | FIX | Fast clicking during a transition left stacked screens; transition clean-up was cancelled by the next screen |
| DS-3.7.0-12 | FIX | After-delay interactions inside overlays never fired; Back from an overlay now closes it instead of leaving the screen |
| DS-3.7.0-13 | FIX | Escape closed the prototype even when a Key interaction used Escape |
| DS-3.7.0-14 | CHG | Files from older versions: “Slide in” / “Push” become their left-moving equivalents automatically |
| DS-3.7.0-15 | KNOWN | “Change to” changes are reset when the prototype closes; Smart animate matches layers by name path inside top-level frames |

## v3.6.0 — “Components” · 2026-10-16
Components now behave like Figma: instances keep their own changes, resize properly, and gain variants, properties and swapping.

| ID | Type | Change |
|---|---|---|
| DS-3.6.0-01 | FIX | **Any edit on an instance becomes an override automatically** (canvas resize, hide, rename, fills, text, effects…) and survives later edits of the main component. Before, canvas resizing and hiding layers snapped back |
| DS-3.6.0-02 | FIX | **Resizing an instance reflows its layers by their constraints** (left, right, left-right, center, scale / top, bottom, top-bottom, center, scale) — the same rules as resizing a frame |
| DS-3.6.0-03 | FIX | Visibility and layer names are overridable per instance; auto-layout “hug” size is not treated as an override |
| DS-3.6.0-04 | CHG | Deleting a layer inside an instance hides it instead (instance structure follows the main component, like Figma); Reset overrides brings it back |
| DS-3.6.0-05 | NEW | **Variants**: Object › Combine as Variants (Ctrl+Alt+Shift+K) wraps main components in a variant set (❖, dashed purple outline, variant names on canvas); name variants “Property=Value, Other=Value”; ＋ Add variant / Variant from this |
| DS-3.6.0-06 | NEW | Instances of a variant get a **dropdown per variant property**; switching keeps your overrides (matched by layer path) and the instance’s size; variant instances are named after their set |
| DS-3.6.0-07 | NEW | **Component properties** on a main component or variant set: Text (edits a text layer), Boolean (shows/hides a layer), Instance swap (replaces a nested instance). Instances edit them in one field; bound by layer, so renamed instance layers still work |
| DS-3.6.0-08 | NEW | **Swap instance** to any other component (overrides kept where layer paths match) |
| DS-3.6.0-09 | NEW | **Override list** on instances: every overridden property as a chip — click to reset one; **Reset all**; **Push to main** (applies the instance’s changes to the main component and every instance) |
| DS-3.6.0-10 | NEW | Main component: description (shown in Assets), instance count; Assets: drag a component onto the canvas (drops into the frame under the cursor), variant names shown |
| DS-3.6.0-11 | FIX | Nested instances: outer instances sync first, so swapped nested instances keep their own main component |
| DS-3.6.0-12 | KNOWN | Layers inside instances can’t be moved (as in Figma); component properties of a variant set are defined on the set |

---

## v3.5.0 — “Triggers” · 2026-10-16
One trigger system for every section: **When** an event happens **(If** conditions pass**) Then** run a sequence of actions. Works in Play (prototype), Design › Animate ▶ Preview, 3D ▶ Preview and in exported Interactive HTML / 3D viewers.

| ID | Type | Change |
|---|---|---|
| DS-3.5.0-01 | NEW | **19 events**: click, double click, press, release, hover in / out, long press, drag (scrubs a number input), swipe (4 directions), start / screen opens, after delay, every N ms (repeat count), key down / up (any key), cursor move → X/Y inputs, scroll → progress input + “at %” threshold, input changes (any change or when a condition becomes true), animation ends |
| DS-3.5.0-02 | NEW | **18 actions**, run in sequence with a per-step delay: play animation (play, restart, reverse, play/pause, pause, stop, **scrub from an input**; loop & speed override), change property with tween + easing (fixed value, **mapped from an input**, or relative), show / hide, fire / set / toggle / step inputs (min, max, wrap), go to frame, back, open / close overlay, scroll to layer, camera to object, reset camera (3D), open link, send event to page code |
| DS-3.5.0-03 | NEW | Conditions on global inputs (==, ≠, <, >, ≤, ≥), **Only once**, **Cooldown (ms)**, enable / disable, name, duplicate |
| DS-3.5.0-04 | NEW | Trigger editor in **Design › Prototype tab** (selected layer, or page-level when nothing is selected) and in the **3D inspector** (selected object, or scene-level); plain-language summaries (“When Hover in on CTA Button → Y +-8”) |
| DS-3.5.0-05 | NEW | **Recipes** (one click): hover lift, hover fade, press feedback / pop bounce, click play animation, click toggle boolean, click count up, drag to scrub an animation, long-press show/hide, follow the cursor (parallax), next frame, fly camera to object; global: Space play/pause, arrow keys step, autoplay on start, loop every 3 s, scroll-linked animation, cursor → inputs, R reset camera, Esc go back |
| DS-3.5.0-06 | NEW | **All triggers** overview (View › All Triggers…, Ctrl+Alt+T): every trigger by section, enable / disable, jump to edit |
| DS-3.5.0-07 | NEW | Exported players: triggers included; `DesignStudioPlayer.on(name, fn)` (or `'*'`) receives “Send event” actions, also posted to the parent page (`postMessage({source:'designstudio', event})`) |
| DS-3.5.0-08 | CHG | Previews restore every property a trigger changed when they stop; while a preview / prototype runs, keys go to triggers instead of editor shortcuts (Esc still stops) |
| DS-3.5.0-09 | CHG | 3D ▶ Preview: when a Scroll trigger exists, the mouse wheel drives scroll progress (orbit zoom pauses) |
| DS-3.5.0-10 | CHG | Triggers are part of undo (Design and 3D histories separately), saved in the project file and validated on load; deleting a layer / object removes its triggers |
| DS-3.5.0-11 | CHG | Prototype tab: the old interaction list is now “Classic links (prototype only)” — still works; triggers are the recommended way |
| DS-3.5.0-12 | KNOWN | “Go to frame / overlay / scroll to” run only in the prototype player (Animate preview shows a notice); drag distance is measured in design pixels |

---

## v3.4.0 — “Polish” · 2026-10-16
Fixes from the UX & workflow review (UX-01 … UX-15). Each row names the review issue it closes.

| ID | Type | Review | Change |
|---|---|---|---|
| DS-3.4.0-01 | FIX | UX-15 | **Media work is saved**: every clip change is stored in this browser (frames, delays, loop, audio ≤ 2 min); after a reload Media offers *Restore / Discard*; “Saved in this browser” state in the Media toolbar; leaving the page warns if a save is pending or failed |
| DS-3.4.0-02 | CHG | UX-01 | Mode switch renamed **Edit / Animate** (with icons) — “Design” now only names the section |
| DS-3.4.0-03 | FIX | UX-02 | Works from 1024 px: minimap and Grid/Snap hide below 1280 px (still in View menu), panels narrow, Timeline/Play labels collapse below 1100 px, timeline header wraps, status bar never wraps; Export always visible |
| DS-3.4.0-04 | FIX | UX-03 | Each section undoes only its own work: Design undo no longer rewinds 3D keyframes or 3D-made animations; every step has a name (“Undo Draw rect”, “Undo Add Torus”, “Undo Resize”) in the Edit menu, Undo tooltips and a short “Undid: … · Section” confirmation |
| DS-3.4.0-05 | FIX | UX-04 | Menus are keyboard-operable (Enter/↓ opens, ↑↓ Home End move, ←→ switch menu, Esc returns focus) with menu roles; welcome cards are focusable buttons; welcome closes with Esc; visible focus ring everywhere |
| DS-3.4.0-06 | FIX | UX-05 | Toasts: duration scales with length (2.4–8 s), pause on hover when they have an action, cleared when switching sections, announced to screen readers (`aria-live`), max 3, never block canvas clicks; optional action button (e.g. *Undo* after deleting a comment) |
| DS-3.4.0-07 | CHG | UX-06 | **One Export button** top-right in every section (and Ctrl+E): Design opens the export dialog, Media and 3D open a format menu under the same button |
| DS-3.4.0-08 | NEW | UX-07 | Welcome screen asks “What do you want to make?” — Design, Animate, Media, 3D — plus **What’s new in v3.4**; “Start Designing” renamed “Explore the sample file” |
| DS-3.4.0-09 | NEW | UX-08 | **Keyframe diamonds** (◆) in Animate mode next to X, Y, W, H, rotation, radius, opacity and Fill: click to add / remove a key at the playhead; dim = animated, bright = key here |
| DS-3.4.0-10 | FIX | UX-09 | Contrast: hint text #949494 (≥ 4.7 : 1 on all panels), filled buttons on #0A71C4 (5.0 : 1) and #7C3AED (5.7 : 1) |
| DS-3.4.0-11 | FIX | UX-10 | Icon-only buttons get accessible names automatically (also in Media / 3D panels rendered later); project name field labelled; all top-bar and header controls ≥ 24 px |
| DS-3.4.0-12 | NEW | UX-14 | **Comments**: press C (or 💬) and click the canvas to pin a comment; replies, resolve / reopen, delete with undo, list drawer with resolved filter, pins follow their frame; saved in the project file |
| DS-3.4.0-13 | NEW | UX-14 | **Versions**: File › Save Version… (Ctrl+Alt+S) with name and note; Version History with restore (current state is auto-saved first), download and delete; kept in this browser (30) |
| DS-3.4.0-14 | NEW | UX-14 | **Share Package (.zip)**: editable project, interactive HTML player, 3D viewer (if any), preview PNG, comments.md and a README — one file to hand over |
| DS-3.4.0-15 | CHG | UX-11 | Status bar shows section info (Media: file, size, frames, duration; 3D: objects, selection, animation time); FPS moved to About › diagnostics |
| DS-3.4.0-16 | FIX | UX-12 | Inspector sections collapse (▾, remembered); fill type select no longer clipped |
| DS-3.4.0-17 | CHG | UX-13 | Export defaults to the frame you work in (selection only when you picked layers inside it); preview on a checkerboard with name and size |
| DS-3.4.0-18 | KNOWN | UX-14 | Comments and versions are local-first (no live multi-user); versions stay in the browser that saved them — download one to share it |

---

## v3.3.0 — “3D” · 2026-10-14
3D section (Spline-style), wired into the Rive-style animation system with global inputs.

| ID | Type | Change |
|---|---|---|
| DS-3.3.0-01 | NEW | **3D** section: WebGL viewport (orbit / pan / zoom), outliner with visibility and nesting, inspector, animation bar. three.js r170 loads only when the section is first opened |
| DS-3.3.0-02 | NEW | Primitives: box (rounded corners), sphere, cylinder, cone, torus, torus knot, capsule, icosahedron, plane, 3D text label. New objects are placed in a free spot on the ground |
| DS-3.3.0-03 | NEW | Lights: sun (directional), point, spot, hemisphere, ambient; soft shadows; pickable light markers |
| DS-3.3.0-04 | NEW | Materials: Standard PBR, Clear-coat, Glass (transmission / IOR), Toon, Unlit, Normals; colour, metalness, roughness, opacity, glow, wireframe, flat shading |
| DS-3.3.0-05 | NEW | Scene: studio image-based lighting, exposure, shadow-catcher or solid ground, fog, transparent background, editor grid, saved scene camera (FOV, orbit, auto-rotate for exports) |
| DS-3.3.0-06 | NEW | Gizmo: move / rotate / scale (W / E / R), world/local space, snapping, focus (F); click to select |
| DS-3.3.0-07 | NEW | Import GLB, glTF (embedded), OBJ and STL (≤ 30 MB, stored in the project); auto-centred and fitted |
| DS-3.3.0-08 | NEW | **Extrude from Design**: selected vector layers become 3D (depth, bevel, original colours) |
| DS-3.3.0-09 | NEW | Keyframes for 3D objects (position, rotation, scale, colour, opacity, glow, metalness, roughness, light colour / intensity) in the **same animations** as Design; ◆ Key, Unkey, Auto-key, key markers, loop / ping-pong / one shot |
| DS-3.3.0-10 | NEW | **Global triggers in 3D**: per-object interactions (click / press / release / hover in / hover out → fire, set or toggle a global input) and a one-click recipe “Click / Hover plays <animation>” (input + listener + state + transitions) |
| DS-3.3.0-11 | NEW | ▶ Preview runs every state machine on the 3D scene with live inputs; Design-side runtimes (Animate preview, Prototype) also drive 3D objects through the shared input bus |
| DS-3.3.0-12 | NEW | Export: PNG (up to 4K, current view), **GLB with animation clips**, **Interactive 3D HTML** (self-contained viewer + state machines + `DesignStudioPlayer` API), **Animation → Media** (renders frames into the Media section for GIF / MP4 / WebM / WebP …) |
| DS-3.3.0-13 | NEW | 3D undo / redo (60 steps, Ctrl+Z / Ctrl+Shift+Z), duplicate (Ctrl+D), delete, Space play, K key, Esc deselect / stop preview |
| DS-3.3.0-14 | CHG | Design › Animate listener targets now include 3D objects; keyframe interpolation treats any string value as a colour |
| DS-3.3.0-15 | KNOWN | GLB export carries transform animation only (colour / opacity keys are glTF-unsupported); hemisphere & ambient lights are not part of glTF |
| DS-3.3.0-16 | KNOWN | Animations embedded in imported models are listed but not played; .gltf files with external .bin/texture files must be converted to .glb first |
| DS-3.3.0-17 | KNOWN | 3D undo history resets when the shared animations / state machines were changed in Design since the last 3D edit (prevents overwriting that work) |

Libraries: `js/vendor/three-bundle.js` — three.js r170 + addons (MIT).

---

## v3.2.0 — “Media” · 2026-10-14
Media section: ezgif-style toolset, fully local (nothing is uploaded).

| ID | Type | Change |
|---|---|---|
| DS-3.2.0-01 | NEW | **Media** section workspace: tool sidebar, stage preview (fit / 100%), playback, frame strip, options panel, source card, output card |
| DS-3.2.0-02 | NEW | Open: GIF (full disposal handling), APNG, animated WebP/AVIF, MP4/WebM/MOV video, still images. Open via button, drag-and-drop or paste |
| DS-3.2.0-03 | NEW | Create: Animation maker (images → animation; size, fit, background), Video to animation (range picker using the video playhead, fps, width, keeps audio), Sprite sheet cutter, **From Design animation** (renders any timeline) |
| DS-3.2.0-04 | NEW | Edit: Resize, Crop (drag on stage, aspect presets, auto-trim), Rotate & flip, Cut/trim frames, Speed, Reverse / ping-pong, Frame delays & loop, Frame skip, Add text, Overlay image, Censor (blur / pixelate / black box), Effects & filters (15 controls + presets), Transparency (pick colour on stage / flatten) |
| DS-3.2.0-05 | NEW | Live preview of visual edits on the current frame; structural edits show a before → after summary |
| DS-3.2.0-06 | NEW | Frame strip: per-frame delay, drag to reorder, duplicate, delete, move, append images (+ Frames or drop on the strip) |
| DS-3.2.0-07 | NEW | Optimize: **GIF optimizer** (colours, lossy, dithering, transparency optimisation with fuzz, global palette), Image compressor (PNG-8, JPEG, WebP, AVIF where supported), Video compressor (quality, scale) |
| DS-3.2.0-08 | NEW | Convert & export: Animated GIF, APNG, animated WebP, MP4 (H.264 + AAC/Opus audio), WebM (VP9 + Opus), frames ZIP (+ frames.json), sprite sheet (PNG + JSON map), still PNG/JPEG/WebP/AVIF, base64 data URI |
| DS-3.2.0-09 | NEW | Output card: preview, size and **% change vs. the source file**, encode time, Download, *Use as source* (chain tools) |
| DS-3.2.0-10 | NEW | Undo / Redo (8 steps, Ctrl+Z / Ctrl+Shift+Z), Revert to original; keys: Space play, ← → frames, Del delete frame, Enter apply |
| DS-3.2.0-11 | NEW | *Send frame to Design* places the current frame as an image layer |
| DS-3.2.0-12 | NEW | Audio follows Cut, Speed, Reverse and Ping-pong edits; manual frame reorder/duplicate/delete drops audio |
| DS-3.2.0-13 | CHG | Status bar shows only section-relevant items outside Design; paste in Media goes to the Media section |
| DS-3.2.0-14 | KNOWN | Video export needs WebCodecs (Chrome / Edge / recent Safari / Firefox); otherwise falls back to MediaRecorder (real-time, no audio). AVIF encode only where the browser supports it |
| DS-3.2.0-15 | KNOWN | GIF “lossy” is an approximation of gifsicle --lossy (near-colour run stabilisation); results differ from ezgif’s exact sizes |
| DS-3.2.0-16 | KNOWN | Clips are held in memory as full frames: keep video imports ≤ 600 frames; use Resize / Frame skip on large clips |

Libraries bundled locally in `js/vendor/media-libs.js` (MIT): gifenc, gifuct-js, mp4-muxer, webm-muxer, fflate.

---

## v3.1.0 — “Animate” · 2026-10-14
Sections + Rive-style interactivity.

| ID | Type | Change |
|---|---|---|
| DS-3.1.0-01 | NEW | Versioning: `js/version.js`, version pill in status bar, About dialog with copyable diagnostics, version stored in saved project files, `_versions/` snapshots, this changelog |
| DS-3.1.0-02 | NEW | Workspace sections in the top bar: **Design**, **Media**, **3D** (Ctrl+Alt+1/2/3). Media and 3D are placeholders until v3.2.0 / v3.3.0 |
| DS-3.1.0-03 | NEW | **Design / Animate** mode switch (Rive style). Animate mode captures a *setup pose*; leaving it restores design values |
| DS-3.1.0-04 | NEW | Multiple named animations (timelines) with their own duration, FPS and loop type (Loop ↻ / Ping-pong ⇄ / One shot →); add, rename, duplicate, delete |
| DS-3.1.0-05 | NEW | State machines: Entry / Any State / Exit + animation states, transitions with conditions, mix duration (ms), exit time (%), speed per state, multiple layers that play in parallel |
| DS-3.1.0-06 | NEW | Graph editor: drag states, drag from ● to connect, click arrows to select, Delete to remove, double-click to rename |
| DS-3.1.0-07 | NEW | **Global inputs** (Boolean / Number / Trigger) shared by every state machine, the prototype player and (from v3.3.0) the 3D section |
| DS-3.1.0-08 | NEW | Listeners: click / pointer down / up / enter / exit on a layer → fire, set or toggle an input |
| DS-3.1.0-09 | NEW | Live preview on the canvas (current state highlighted, inputs controllable, Esc to stop; design values restored afterwards) |
| DS-3.1.0-10 | NEW | Prototype interactions can **fire a trigger / set an input**; state machines and listeners run live inside Play |
| DS-3.1.0-11 | NEW | Export › Animation › **Interactive HTML** — self-contained player with `DesignStudioPlayer.fire/set/get/inputs/onInput` API (Rive-runtime equivalent) |
| DS-3.1.0-12 | CHG | Toasts moved to the top of the screen (no longer cover the timeline) |
| DS-3.1.0-13 | KNOWN | Lottie / CSS / video exports use the *active* animation only (state machines are exported only by Interactive HTML) |

## v3.0.1 — Export / import fixes · 2026-10-14
| ID | Type | Change |
|---|---|---|
| DS-3.0.1-01 | FIX | SVG export: inside/outside stroke alignment |
| DS-3.0.1-02 | FIX | Radial gradients identical in canvas, SVG and CSS (fitted ellipse) |
| DS-3.0.1-03 | FIX | SVG linear gradient angle on non-square shapes |
| DS-3.0.1-04 | FIX | Group/frame opacity composited as one layer (canvas + PNG) |
| DS-3.0.1-05 | FIX | HTML export: lines/arrows invisible, pen paths offset |
| DS-3.0.1-06 | FIX | HTML / Inspect / CSS keyframes: children of rotated or flipped frames |
| DS-3.0.1-07 | FIX | Unique SVG ids per document (no gradient collisions in HTML) |
| DS-3.0.1-08 | FIX | React export: inline SVG `style` as object |
| DS-3.0.1-09 | FIX | Text baseline + line-height identical in canvas / SVG / HTML |
| DS-3.0.1-10 | FIX | Rectangle strokes use mitred corners |
| DS-3.0.1-11 | NEW | SVG export: inner shadows |
| DS-3.0.1-12 | FIX | CSS keyframes keep flips; correct in auto-layout / rotated parents |
| DS-3.0.1-13 | FIX | Lottie: inherited opacity, gradient fills, effect note |
| DS-3.0.1-14 | FIX | Video export length; sprite-sheet loop timing; honest @scale filename |
| DS-3.0.1-15 | FIX | SVG import isolated (no CSS leak, no remote requests) |
| DS-3.0.1-16 | NEW | SVG import: `<use>`/`<symbol>`, group hierarchy + opacity, even-odd fills, multi-line text, gradients, skip report |
| DS-3.0.1-17 | FIX | Autosave moved to IndexedDB (no 5 MB limit); large images downscaled to 2400px |
| DS-3.0.1-18 | KNOWN | SVG: background blur not exportable; SVG round-trip turns frames into rects; tspan styling flattened |

## v3.0.0 — Rebuild · 2026-10-14
| ID | Type | Change |
|---|---|---|
| DS-3.0.0-01 | CHG | Engine rebuilt into modules (`js/*.js`), single CSS file |
| DS-3.0.0-02 | FIX | All 29 menu items + advertised shortcuts wired |
| DS-3.0.0-03 | NEW | Autosave, Save / Save As / Open, Recent project |
| DS-3.0.0-04 | FIX | Text tool, undo (nudges/drags), ungroup selection, recursive delete, nested layers |
| DS-3.0.0-05 | NEW | Timeline keyframes, playback, auto-key, onion skin, easing |
| DS-3.0.0-06 | NEW | Lottie, CSS keyframes, video, sprite sheet, APNG, Figma REST JSON, SVG import, components, gradient editor |
| DS-3.0.0-07 | FIX | ~100 unwired panel controls; real HTML/React/Vue/Svelte/Tailwind export |
| DS-3.0.0-08 | FIX | XSS via layer names; render only when dirty |

## v2.0.0 — Original
Single-file prototype (`_versions/v2.0.0/index.html`). See the review of 2026-10-14 for its issues.
