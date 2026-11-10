# DesignStudio — QA suite

Automated production tests that drive the real app in a headless Chromium.

```bash
cd tests
npm i playwright axe-core        # once
npx playwright install chromium  # once, if Chromium is not installed
node qa.js                        # all suites  → report.json
node qa.js --only=design,3d       # selected suites
npx playwright install firefox webkit
node qa.js --browser=firefox      # Firefox engine
node qa.js --browser=webkit       # WebKit (Safari engine)
```

| Suite | What it checks |
|---|---|
| boot | app starts, every module loaded, all three sections open, top bar complete everywhere |
| unit | easings, cubic-bezier, utils, keyframe evaluation, lossless save/load, malformed-data loader |
| design | real mouse/keyboard: draw rect/ellipse/text/frame, move, undo/redo, copy/paste/duplicate/delete, group, properties, zoom, ruler guides |
| persistence | autosave → reload restores the project; project JSON shape |
| animation | Animate mode, keyframes, prototype play/close |
| export | SVG, Animated SVG, PNG, Lottie, CSS/code/tokens, interactive HTML (runs it in a new page) |
| media | open image, resize + undo, compressor, rulers/guides/grid, top-bar zoom, Edit/Animate, GIF export |
| 3d | all primitives, inspector + undo, keyframes/playback, dope-sheet copy/paste/easing, guides, GLB, viewer HTML (runs it) |
| links | 3D → Design with auto-refresh, adjust in Design, Design → 3D texture, Links panel, unlink |
| comments | comment mode in Design, Media and 3D |
| touch | (Chromium) real multi-touch via DevTools: tap select, one-finger drag, two-finger pinch-zoom/pan, long-press menu, finger-sized handles, pen drawing, palm rejection, 3D touch orbit |
| compat | Safari/Firefox code paths forced in Chromium: canvas-filter polyfill (blur, colour), shadows/blur, manual letter-spacing, Media effects |
| malicious | real malicious files through the real file inputs: prototype-pollution project, remote / javascript: asset URLs, javascript: links, 3D remote textures and external-reference glTF, 20000² PNG bomb, 12000² GIF bomb, SVG entity expansion, SVG with scripts / handlers / remote refs, oversized JSON, CSP blocks injected scripts, zero requests to the attacker host |
| security | XSS payloads in names / text / title / comments / 3D names / imported JSON; export escaping; MCP origin |
| robustness | corrupted import, empty project, 2,000 layers, undo/redo spam, section-switch spam, storage failures |
| monkey | 600 seeded random clicks / keys / drags across all sections |
| a11y | axe-core (critical + serious) per section, keyboard focus visibility |
| responsive | 1024, 1280, 1920 and 390 px wide: no page overflow, top bar fits |
| performance | cold load, 1,000-layer pan fps, 3D boot time, JS heap |

Every suite also fails on any uncaught page error or console error. Exit code is 1 when anything fails.
