# FDM G-code Viewer — Spec (v1)

## 1. Purpose

A standalone, browser-based viewer for reviewing **already-generated** FDM
G-code files. It loads a local `.gcode` file and renders the toolpath in 3D
for visual inspection — nothing more.

This is a companion tool to `Rhino_PyWorkshop`, which exports G-code via
`ultimaker.py`, `ultimaker_speeds.py`, `wasp_delta.py`, and
`generic_gcode.py`. The viewer has **no code dependency** on that repo — it
only needs to open the files it produces.

## 2. Non-goals (v1)

Explicitly out of scope, to keep this repo a pure frontend viewer:

- Slicing or G-code generation of any kind
- A backend, upload API, or persistent storage
- Live machine control / serial streaming to a printer
- CNC/laser/robotic (KUKA) toolpaths — FDM only for v1
- Multi-file comparison, auth, or cloud sync
- Editing or modifying G-code

Slicing/regeneration and any server-side concerns belong to a **separate
backend project**, addressed later. This repo assumes a `.gcode` file
already exists on the user's machine.

## 3. Input

- File picker + drag-and-drop of a single `.gcode`/`.gco`/`.g` file
- Parsed entirely client-side, in the browser — no upload, no network call
- No dependency on any sidecar metadata file; must work from raw G-code alone

## 4. Parser requirements

Target dialect: **Marlin/RepRap-flavored FDM G-code** (Cura, PrusaSlicer,
Slic3r, Simplify3D output — matches what the export scripts in
`Rhino_PyWorkshop` produce).

Must handle:
- `G0`/`G1` linear moves
- `G2`/`G3` arc moves (I/J form; R form as a stretch goal)
- `G90`/`G91` absolute/relative positioning
- `M82`/`M83` absolute/relative extrusion
- `G20`/`G21` units (inch/mm)
- E-axis extrusion tracking (to distinguish travel vs. extrusion moves)
- Layer detection, in order of preference:
  1. Slicer layer-change comments (e.g. `;LAYER:n`, `;LAYER_CHANGE`)
  2. Fallback: group by Z-height changes
- Best-effort extraction of header/footer comments for display (slicer name,
  filament used, estimated print time, nozzle/bed temp) — optional per file,
  never required for rendering to work

Parsing must run in a **Web Worker** so large files don't freeze the UI
thread. Target: smooth handling up to ~150–200k G-code lines.

## 5. Rendering requirements

- Three.js scene; toolpath drawn as line segments (tube geometry as a later
  quality upgrade)
- Color-coding: travel moves vs. extrusion moves, with an optional
  color-by-speed mode
- Layer-by-layer reveal via a scrubber (min layer → max layer)
- Play/pause animation stepping through layers
- Orbit/pan/zoom camera controls
- Build plate representation sized from the file's own bounds (no machine
  profile required — that's metadata the export side owns, not this viewer)
- Grid/axes for scale reference

## 6. UI requirements

- Drop zone / file picker as the entry point
- Sidebar: file name, bounding box dimensions, layer count, estimated print
  time and filament usage *if present in comments* (never inferred/faked)
- Layer scrubber + play/pause
- Toggle: show/hide travel moves
- Toggle: color-by-move-type vs. color-by-speed

## 7. Architecture

- Vite + TypeScript, vanilla (no framework — keeps the dependency footprint
  minimal for a single-purpose tool)
- Three.js for rendering
- Parsing isolated in a Web Worker module, decoupled from rendering code
- Suggested module boundaries:
  - `src/parser/` — G-code parsing, pure functions, no DOM/Three.js
  - `src/render/` — Three.js scene setup and toolpath geometry
  - `src/ui/` — DOM controls, scrubber, sidebar
  - `src/worker/` — worker entry point wrapping the parser
- In-memory state only; nothing persisted, no backend calls

## 8. Reference implementations (prior art)

Evaluated against this spec. Use as reference/inspiration, not a starting
point to copy wholesale — none matches the module boundaries in §7 exactly.

| Repo | Verdict | Use for |
|---|---|---|
| [`xyz-tools/gcode-preview`](https://github.com/xyz-tools/gcode-preview) | **Primary reference.** MIT, TS, active (198★, 1265 commits, real toolchain: rollup/vitest/eslint/typedoc) | Parser logic, G2/G3 arc math, tube geometry, build-volume rendering, PrusaSlicer thumbnail extraction. See §8.1 for the dependency-vs-reimplement decision. |
| [`jessegyger/gcoder`](https://github.com/jessegyger/gcoder) | Feature ideas only — includes G-code editing, which is a non-goal here | XY/Z measurement tool concept, layer-search UI pattern |
| [`joewalnes/gcode-viewer`](https://github.com/joewalnes/gcode-viewer) | Historical only — unmaintained ~12+ years | Original toolpath-to-geometry math, for background understanding |
| [`aligator/gcode-viewer`](https://github.com/aligator/gcode-viewer) | Niche (built for GoSlice) | Mesh-based line rendering — works around a browser limitation where `THREE.Line` width is capped at 1px on most platforms |
| [`gabotechs/react-gcode-viewer`](https://github.com/gabotechs/react-gcode-viewer) | Wrong framework (React) but clean API | Prop design ideas: `visible: number` (0–1) for layer-percentage scrubbing instead of raw index; `onProgress`/`onFinishLoading`/`onError` callback shape |

### 8.1 Open decision: depend on `gcode-preview` vs. reimplement

`gcode-preview`'s `processGCode()` API appears synchronous in its public
docs — **verify whether it parses off the main thread** before deciding:

- **If worker-safe (or easily wrapped that way):** depend on it directly as
  an npm package for the parser + renderer core. Fastest path to v1.
- **If not worker-safe:** treat its parser as a reference implementation
  only. Reimplement inside `src/worker/` per the module boundaries in §7,
  reusing its arc-math and tube-geometry approach for `src/render/`.

This decision gates the rest of implementation — resolve it first, and
record the outcome (and why) at the top of `src/parser/README.md` or
equivalent.

## 9. Packaging

- Static site output (`vite build`) — deployable to GitHub Pages, Netlify,
  Vercel, or opened locally
- Single bundle; no server required to run it

## 10. Success criteria (v1)

- Correctly loads and renders real output from `wasp_delta.py`,
  `ultimaker.py`, and `generic_gcode.py`
- Layer scrubbing is smooth on files up to the target line count
- No crashes on files with unusual/missing slicer comments — degrade
  gracefully to Z-height-based layer detection and omit optional stats

## 11. Future (explicitly deferred, not v1)

- Backend service for slicing/regeneration
- Uploading files to a server for sharing/review
- Multi-file diff/compare view
- CNC/robotic toolpath support
