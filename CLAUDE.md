# CLAUDE.md

## What this project is

A standalone, client-side web viewer for reviewing already-generated FDM
G-code files. Load a `.gcode` file in the browser, see the toolpath in 3D.
That's the whole product. Full spec: `SPEC.md`.

Companion tool to a separate repo, `Rhino_PyWorkshop` (Rhino/Grasshopper,
Python), which produces the `.gcode` files this viewer opens. **Do not add
any dependency on that repo.** This project only needs to understand the
G-code file format, nothing else about how it was generated.

## Non-goals — do not implement these without being explicitly asked

- Slicing or G-code generation
- A backend, API, or persistent storage
- Live/serial connection to a printer
- CNC, laser, or robotic (KUKA) toolpath support — 3D printing gcode only
- Multi-file comparison, auth, cloud sync, or G-code editing

If a task seems to require any of the above, stop and flag it rather than
building it — it belongs in a separate backend project.

## Future extension
- Different machine setups as defined in Rhino_PyWorkshop
- KRL support for 1:1 3DCP fabrication with KUKA

## Stack

- Vite + TypeScript
- Vanilla JS/TS — no UI framework
- Three.js for 3D rendering
- Parsing runs in a Web Worker — must never block the main thread

## Module boundaries

- `src/parser/` — G-code parsing only. Pure functions. No DOM, no Three.js
  imports here.
- `src/analysis/` — checks over an already-parsed toolpath (build volume,
  travel/nozzle collisions) plus the packed typed-array form they run on.
  Pure functions, same rules as `src/parser/`. See `src/analysis/README.md`.
- `src/render/` — Three.js scene, geometry, camera. No parsing logic.
- `src/ui/` — DOM controls: drop zone, sidebar, scrubber, playback,
  measurement/analysis panels.
- `src/worker/` — thin wrappers exposing the parser and the analysis pass to
  the main thread.

Keep these boundaries. If you find yourself importing Three.js into
`src/parser/`, or DOM APIs into the worker, stop and reconsider the module
split before proceeding.

## G-code dialect assumptions

Marlin/RepRap FDM output (Cura, PrusaSlicer, Slic3r, Simplify3D). Support
`G0`/`G1`/`G2`/`G3`, `G90`/`G91`, `M82`/`M83`, `G20`/`G21`, E-axis tracking.
Layer detection: prefer slicer comments (`;LAYER:`, `;LAYER_CHANGE`), fall
back to Z-height grouping. Treat all header/footer metadata (print time,
filament used) as optional — never block rendering on its absence, never
fabricate values that aren't in the file.
Future scalability to read KRL or other languages

## Reference implementations

Don't build the parser/renderer from a blank page — these were reviewed
against this spec (full comparison in `SPEC.md` §8):

- **`xyz-tools/gcode-preview`** (github.com/xyz-tools/gcode-preview) — primary
  reference. MIT, TypeScript, actively maintained. Read its parser and
  Three.js rendering code for: G2/G3 arc math, tube geometry, build-volume
  rendering, PrusaSlicer thumbnail comment extraction.
- **`aligator/gcode-viewer`** — reference only for its mesh-based line
  rendering approach, which works around `THREE.Line` width being capped at
  1px on most platforms/browsers.
- **`gabotechs/react-gcode-viewer`** — reference only for its prop API
  shape: layer visibility as `visible: number` (0–1 percentage) rather than
  a raw layer index, and `onProgress`/`onFinishLoading`/`onError` callbacks.
- **`jessegyger/gcoder`** — reference only for feature ideas (XY/Z
  measurement tool, layer search). It includes G-code editing, which is a
  non-goal here — do not port that part.
- **`joewalnes/gcode-viewer`** — historical background only, unmaintained.
  Don't use as a code source.

**First task, before writing the parser:** resolve the open decision in
`SPEC.md` §8.1 — check whether `gcode-preview`'s `processGCode()` actually
parses off the main thread. If yes (or trivially wrappable), depend on it
directly as an npm package. If no, reimplement the parser in `src/worker/`
using it as a reference, and reuse its arc-math/tube-geometry approach in
`src/render/`. Record the outcome and reasoning at the top of
`src/parser/README.md` before proceeding with the rest of implementation —
this decision affects the module boundaries below.

## Commands

```bash
npm run dev      # local dev server
npm run build    # typecheck + production static build
npm run test     # parser unit tests (vitest)
npm run lint     # lint
```

## Testing expectations

Parser needs unit tests against real sample `.gcode` fixtures — ideally
actual output from `wasp_delta.py`, `ultimaker.py`, and `generic_gcode.py`,
plus at least one file with missing/unusual slicer comments to verify
graceful fallback to Z-height layer detection.

## Performance target

Smooth layer scrubbing on files up to ~150–200k G-code lines. If a change
risks blocking the main thread during parsing or rendering, flag it.
