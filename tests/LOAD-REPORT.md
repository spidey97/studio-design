# DesignStudio 3.33.0 — load & monitoring report

2026-11-05 · Chromium (Playwright, headless, software GL) · 2 CPU cores · Node v22.23.4 · quick mode

**11 / 11 scenarios pass.**

| # | Scenario | Result | Main-thread CPU | Heap (after GC) | Key numbers |
|---|---|---|---|---|---|
| s1 | Large document (2,000 layers) | ✅ pass | 88.7% | 2.6 → 18.8 MB | all layers restored after delete + undo: 2009 · insert + commit: 99 ms · full render (median): 11 ms |
| s2 | Memory leak check (25 edit cycles) | ✅ pass | 75.2% | 2.6 → 17.2 MB | heap growth over 20 cycles after warm-up: 11.3 MB |
| s3 | Animation playback (Kova project, 8 s) | ✅ pass | 78.4% | 2.6 → 4.6 MB | playback frame rate: 60 fps · time lost to long tasks: 0 ms of 8000 |
| s4 | Autosave under load (2,000 layers × 30 saves) | ✅ pass | 45.5% | 2.6 → 7.9 MB | writes recorded by the monitor: 30 · failed writes: 0 · write p95: 41 ms |
| s5 | Media: 120-frame GIF (load, resize, reverse, optimize) | ✅ pass | 68% | 2.6 → 3.9 MB | all 120 frames decoded: 120 · decode: 249 ms · resize ×2 (120 frames): 120 ms |
| s6 | 3D scene: 120 objects, orbiting (Auto vs previous behaviour) | ✅ pass | 100% | 2.6 → 11.2 MB | objects in scene: 124 · add 120 objects: 1860 ms · orbit frame cost, Auto vs previous: 1458 vs 3110 ms (×2.1 faster) |
| s7 | Soak: 20 s of random editing | ✅ pass | 97.7% | 2.6 → 3.9 MB | errors during soak: 0 · memory left after clearing document + undo history (leak): 1.2 MB · growth while editing (layers + undo history): 5.8 MB |
| s11 | Undo history: 100 steps (2,000 layers × 110 edits) | ✅ pass | 95.2% | 2.6 → 10.2 MB | undo steps kept: 100 · memory for 100 steps (shared chunks): 3 MB (full copies: 280 MB) · undo still works: yes |
| s8 | API response-time tracking (mock AI service) | ✅ pass | 1.3% | 2.6 → 2.9 MB | every call recorded: 48 · failures counted (500 + dropped): 8 · fast endpoint timing (truth 20 ms): 23 ms |
| s9 | MCP bridge server under load (Node, 127.0.0.1) | ✅ pass | server 95.3% | RSS 55.8 → 101.4 MB | /health throughput: 70,972 req/s · /health errors: 0 · /health p99: 3 ms |
| s10 | Monitoring overhead (idle 10 s, panel closed vs open) | ✅ pass | 1.4% | 2.6 → 2.8 MB | idle main-thread CPU, monitor running: 1.4% · idle main-thread CPU, panel open (live charts): 1.2% |

## Checks

### s1 · Large document (2,000 layers)

| Check | Measured | Limit | |
|---|---|---|---|
| all layers restored after delete + undo | 2009 | ≥ 2000 | ✅ |
| insert + commit | 99 ms | < 6000 ms | ✅ |
| full render (median) | 11 ms | < 400 ms | ✅ |
| move every layer | 171 ms | < 2500 ms | ✅ |
| undo / redo p95 | 51 ms | < 1500 ms | ✅ |

<details><summary>All metrics</summary>

```json
{
 "layers": 2009,
 "insertMs": 99,
 "renderMsMedian": 11,
 "moveAllMs": 171,
 "undoRedoMsP95": 51,
 "deleteAllMs": 27,
 "undoDeleteMs": 202
}
```
</details>

### s2 · Memory leak check (25 edit cycles)

| Check | Measured | Limit | |
|---|---|---|---|
| heap growth over 20 cycles after warm-up | 11.3 MB | < 25 MB | ✅ |

<details><summary>All metrics</summary>

```json
{
 "heapAfterWarmupMB": 5.8,
 "heapAfter25CyclesMB": 17.1,
 "growthMB": 11.3,
 "perCycleKB": 579
}
```
</details>

### s3 · Animation playback (Kova project, 8 s)

| Check | Measured | Limit | |
|---|---|---|---|
| playback frame rate | 60 fps | ≥ 30 fps | ✅ |
| time lost to long tasks | 0 ms of 8000 | < 800 ms | ✅ |

<details><summary>All metrics</summary>

```json
{
 "fps": 60,
 "longTasks": 0,
 "longTaskMs": 0,
 "layers": 228
}
```
</details>

### s4 · Autosave under load (2,000 layers × 30 saves)

| Check | Measured | Limit | |
|---|---|---|---|
| writes recorded by the monitor | 30 | 30 | ✅ |
| failed writes | 0 | 0 | ✅ |
| write p95 | 41 ms | < 1500 ms | ✅ |
| storage connection test | OK 1 ms | OK | ✅ |

<details><summary>All metrics</summary>

```json
{
 "writes": 30,
 "failures": 0,
 "p50": 34,
 "p95": 41,
 "sizeMB": 2.8,
 "target": "IndexedDB",
 "connectionOk": true,
 "roundTripMs": 1
}
```
</details>

### s5 · Media: 120-frame GIF (load, resize, reverse, optimize)

| Check | Measured | Limit | |
|---|---|---|---|
| all 120 frames decoded | 120 | 120 | ✅ |
| decode | 249 ms | < 8000 ms | ✅ |
| resize ×2 (120 frames) | 120 ms | < 12000 ms | ✅ |
| reverse | 20 ms | < 3000 ms | ✅ |
| GIF optimizer | 856 ms | < 30000 ms | ✅ |
| JS heap after media work | 91 MB | < 900 MB | ✅ |

<details><summary>All metrics</summary>

```json
{
 "frames": 120,
 "resizeMs": 120,
 "width": 640,
 "reverseMs": 20,
 "optimizeMs": 856,
 "heapMB": 91,
 "loadMs": 249
}
```
</details>

### s6 · 3D scene: 120 objects, orbiting (Auto vs previous behaviour)

| Check | Measured | Limit | |
|---|---|---|---|
| objects in scene | 124 | ≥ 120 | ✅ |
| add 120 objects | 1860 ms | < 20000 ms | ✅ |
| orbit frame cost, Auto vs previous | 1458 vs 3110 ms (×2.1 faster) | ≥ ×1.5 faster | ✅ |
| shadow maps redrawn while only the camera moves | 0 | 0 (cached) | ✅ |
| full resolution again at rest | 100% | 100% | ✅ |

<details><summary>All metrics</summary>

```json
{
 "objects": 124,
 "addMs": 1860,
 "trianglesK": 345,
 "beforeMsPerFrame": 3110,
 "autoMsPerFrame": 1458,
 "speedup": 2.1,
 "autoMovingResolutionPct": 50,
 "shadowRedrawsWhileOrbiting": 0,
 "resolutionAtRestPct": 100
}
```
</details>

### s7 · Soak: 20 s of random editing

| Check | Measured | Limit | |
|---|---|---|---|
| errors during soak | 0 | 0 | ✅ |
| memory left after clearing document + undo history (leak) | 1.2 MB | < 25 MB | ✅ |
| growth while editing (layers + undo history) | 5.8 MB | < 400 MB | ✅ |

<details><summary>All metrics</summary>

```json
{
 "actions": 1171,
 "actionsPerSec": 59,
 "newErrors": 0,
 "layers": 863,
 "lagP95": 346,
 "heapWithHistoryMB": 5.8,
 "historyDepth": 100,
 "residualMB": 1.2
}
```
</details>

### s11 · Undo history: 100 steps (2,000 layers × 110 edits)

| Check | Measured | Limit | |
|---|---|---|---|
| undo steps kept | 100 | 100 | ✅ |
| memory for 100 steps (shared chunks) | 3 MB (full copies: 280 MB) | < 3 × one snapshot | ✅ |
| undo still works | yes | yes | ✅ |

<details><summary>All metrics</summary>

```json
{
 "steps": 100,
 "historyMB": 3,
 "snapshotMB": 2.8,
 "budgetMB": 400,
 "undoOk": true,
 "heapMB": 10.2,
 "fullCopiesWouldBeMB": 280
}
```
</details>

### s8 · API response-time tracking (mock AI service)

| Check | Measured | Limit | |
|---|---|---|---|
| every call recorded | 48 | 48 | ✅ |
| failures counted (500 + dropped) | 8 | 8 | ✅ |
| fast endpoint timing (truth 20 ms) | 23 ms | 15–150 ms | ✅ |
| slow endpoint timing (truth 1200 ms) | 1203 ms | 1150–1500 ms | ✅ |
| health flags slow API (p95 ≥ 3 s) | bad (p95 10810 ms) | warn or bad | ✅ |
| secrets & query strings never recorded | clean | clean | ✅ |

<details><summary>All metrics</summary>

```json
{
 "recorded": 48,
 "errors": 8,
 "fastMedianMs": 23,
 "slowMedianMs": 1203,
 "burstFastP95Ms": 405,
 "p95AfterSlowBurst": 10810,
 "healthLevel": "bad",
 "leaked": false,
 "burstMs": 8426
}
```
</details>

### s9 · MCP bridge server under load (Node, 127.0.0.1)

| Check | Measured | Limit | |
|---|---|---|---|
| /health throughput | 70,972 req/s | ≥ 10,000 req/s | ✅ |
| /health errors | 0 | 0 | ✅ |
| /health p99 | 3 ms | < 50 ms | ✅ |
| MCP tools/list throughput | 16,120 req/s | ≥ 5,000 req/s | ✅ |
| MCP tools/list errors | 0 | 0 | ✅ |
| server memory growth | 45.6 MB | < 80 MB | ✅ |

<details><summary>All metrics</summary>

```json
{
 "loadGenerator": "autocannon, 64 connections, 4 s per endpoint",
 "healthRequests": 283903,
 "healthRps": 70972,
 "healthP50": 0,
 "healthP95": 2,
 "healthP99": 3,
 "healthErrors": 0,
 "toolsListRequests": 64489,
 "toolsListRps": 16120,
 "toolsListP99": 8,
 "toolsListErrors": 0,
 "serverCpuPct": 95.3,
 "serverRssStartMB": 55.8,
 "serverRssEndMB": 101.4
}
```
</details>

### s10 · Monitoring overhead (idle 10 s, panel closed vs open)

| Check | Measured | Limit | |
|---|---|---|---|
| idle main-thread CPU, monitor running | 1.4% | < 3% | ✅ |
| idle main-thread CPU, panel open (live charts) | 1.2% | < 10% | ✅ |

<details><summary>All metrics</summary>

```json
{
 "idleCpuPanelClosedPct": 1.4,
 "idleCpuPanelOpenPct": 1.2
}
```
</details>

## Findings & actions

- **3D under load (s6), fixed in 3.32.0.** Orbiting 124 objects (345k triangles) costs 1458 ms per frame in Auto mode vs 3110 ms before (×2.1), because shadow maps are cached (0 redraws while orbiting) and Auto lowered the moving resolution to 50%, with full resolution back at rest. Absolute times here are software rendering (SwiftShader), hundreds of times slower than a real GPU; the ratio is what carries over.
- **Undo history memory (s7, s11), fixed in 3.32.0.** Undo steps now share unchanged parts of the document, so 100 steps of a 2,000-layer document take 3 MB instead of 280 MB. The step count (10–100) and a memory safety limit are user settings. After the soak, clearing the document and history leaves 1.2 MB, so there's no leak.
- **API timing includes browser queueing (s8).** Chromium opens at most 6 connections per host, so a burst of parallel calls queues: the 20 ms endpoint measured p95 405 ms inside the burst, versus 23 ms sequentially. The monitor deliberately reports what the user waits for.
- **MCP bridge server (s9).** /health 70,972 req/s (p99 3 ms) and MCP tools/list 16,120 req/s, 0 errors, memory 55.8 → 101.4 MB, measured with autocannon, 64 connections, 4 s per endpoint. Earlier reports (7,800 req/s) measured the test client, not the server. That's far above real use (one AI app polling one tab).
- **Cost of monitoring (s10).** Idle main-thread CPU is 1.4% with the monitor running and 1.2% with the live panel open.

## How to read this

- **Main-thread CPU** is the page's real main-thread CPU time (DevTools `TaskDuration`) divided by wall time. 100% means the tab was busy the whole time.
- **Heap** is measured after a forced garbage collection, so growth means memory that is still referenced (a possible leak), not garbage waiting to be collected.
- Headless Chromium uses software rendering (SwiftShader), so 3D frame rates here are a floor. Real GPUs run much faster.
- There's no database server: s4 is the storage layer (IndexedDB), and s9 is the only real server (the local MCP bridge).

Run again with `node tests/load.js` (add `--quick` for a 2-minute pass, or `--only=s1,s9`).
