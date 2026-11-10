# DesignStudio 3.22.0 — hard test & user pain-point report

Date: 2026-11-01 · Build tested: source and release · Browser: Chromium (headless), 1440×900 and 1280×720

## 1. What was tested

| Method | Scope | Result |
|---|---|---|
| Feature sweep (automated, every reachable control) | 56 menu / keyboard commands · every Design-panel input for rectangle, text and frame (48) · 17 export formats · 30 Media tools on a 12-frame GIF · 15 3D add buttons and ~95 3D inspector fields · 15 documented shortcuts | 261 checks, no crashes |
| Export downloads | PNG, JPEG, WebP, SVG · CSS keyframes, Lottie, sprite sheet, APNG, MP4 · full web page, CSS, SVG, tokens · plain / React / Vue / Svelte | 17 / 17 produce a non-empty file |
| Regression suite (`tests/qa.js`) | 142 tests in 19 suites incl. security, malicious files, touch, accessibility, responsive, performance | 142 / 142 pass |
| Task walkthrough (new-user scenarios) | Make a hero and export it · animate a layer · compress a GIF · put a 3D object in Design · find AI, design system, prototyping · work on a 1280×720 laptop | 6 bugs, 13 pain points (below) |

False alarms ruled out by re-testing with real typing: panel edits undo correctly (the sweep had compared a changed selection); the opacity number field clamps at 100 (no change is correct).

## 2. Bugs found and fixed in 3.22.0

| # | Problem (what the user experiences) | Fix |
|---|---|---|
| B1 | **New text is invisible.** Text defaults to white, frames default to white — typing on a new Desktop frame shows nothing. | Text colour now contrasts with what it is placed on (dark on light frames, white on dark). Also for pasted text. |
| B2 | **Canvas stays cramped after animating.** Leaving Animate kept the timeline open. | Edit closes the timeline if Animate opened it. |
| B3 | **Minimap covers the work** on laptops (bottom-right of the frame, over the timeline). | Hidden while the timeline is open; can be closed (×) and brought back. |
| B4 | **Media tools fail with an unclear message** when a required input is missing (Overlay without an image); logged as an app error. | Clear instruction toast, no error log (also for “remove every frame”, empty Design canvas, too many frames, unsupported encoder). |
| B5 | **Tour pops up mid-task** right after choosing a Desktop / Mobile template. | Tour only starts from the four “What do you want to make?” buttons (and About). |
| B6 | Last emoji in the UI (record / onion-skin buttons, AI quick actions) rendered differently per OS. | Replaced with icons / typographic glyphs. |

## 3. Pain points still open (prioritised)

Severity = impact × how many users hit it. Recommendations are proposals — not built yet. **Update 3.23.0:** P1–P4 are fixed (see CHANGELOG DS-3.23.0-01…04).

### High
| # | Pain point | Evidence | Recommendation |
|---|---|---|---|
| P1 | **Not enough canvas on laptops.** At 1280×720 with the timeline open the canvas is ~650×330 px between three dense panels. | Screenshot t6 | Hide-UI toggle (Ctrl+\\), resizable / collapsible side panels, compact density setting. |
| P2 | **Lottie export silently drops text, shadows and blurs** — the main motion hand-off format. Users learn it only from a toast after export. | Export sweep toast | List unsupported layers in the dialog before export; “convert text to outlines” option. |
| P3 | **AI Studio covers the Properties panel**, so you cannot tweak what the AI just made without closing it. | Screenshot t5_ai | Dock AI as a resizable column or a right-panel tab. |
| P4 | **How to make keyframes is not explained** in Animate: the auto-key control is a small icon; the empty timeline gives no guidance. | Walkthrough T2 | Empty-state line in the timeline (“Move or change a layer — auto-key records it”), larger auto-key toggle with label. |

### Medium
| # | Pain point | Recommendation |
|---|---|---|
| P5 | Media **Apply is enabled** while a required input is missing (Overlay image). | Disable Apply and show the missing field inline. |
| P6 | **Export size is unknown until download** (an APNG of the hero was 7.3 MB). | Show an estimate and a recommended format before export. |
| P7 | In 3D the top-bar **zoom % has no clear meaning** (e.g. 14 % right after opening). | Show camera distance or “Fit”, or hide the % in 3D. |
| P8 | **Selection handles hide small text** at low zoom (16 px text at 36 %). | Draw handles outside the text box or fade them while editing. |
| P9 | **Welcome screen offers 10 choices** (4 modes + 6 cards) incl. a disabled “Recent project” for new users. | Show the 4 modes first, templates second; hide Recent until there is one. |
| P10 | **Two ways to add behaviour** on the Prototype tab (Interactions and Triggers) with overlapping meaning. | Merge into one “Interactions” list with simple and advanced views. |

### Low
| # | Pain point | Recommendation |
|---|---|---|
| P11 | 25 Media tools in one long column. | Search box / collapsible groups. |
| P12 | Positions show decimals after click-placing text (X 291.43). | Round to whole pixels when placing. |
| P13 | Welcome shortcut list duplicates the ? sheet and is hard to scan. | Replace with “Press ? for shortcuts”. |

## 4. Healthy areas
- Every command, panel field, export format, Media tool and 3D field works and undoes.
- File safety: malicious projects, image bombs, SVG scripts and external 3D references are refused.
- Accessibility: no critical / serious axe violations; visible keyboard focus.
- Performance: cold load < 3 s, 1,500 layers redraw in ~13 ms, 3D starts < 6 s.
