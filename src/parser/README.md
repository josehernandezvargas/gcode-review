# Parser — implementation decision (SPEC.md §8.1)

**Decision: reimplement, don't depend on `gcode-preview` as a package.**

Checked the published `gcode-preview` npm package (v2.18.0, from
`github.com/remcoder/gcode-preview` — the repo referenced in SPEC.md §8 under
the `xyz-tools/gcode-preview` alias):

- `Parser.parseGCode(input): { layers, metadata }` is fully synchronous — it
  returns a plain object, not a `Promise`, and does no `postMessage`/`Worker`
  handoff anywhere in the bundle (`dist/gcode-preview.es.js` has zero
  references to `Worker`).
- `WebGLPreview.processGCode()` is `void`-returning and calls `parseGCode`
  directly inline before touching the Three.js scene — parsing and rendering
  are not separable calls, they're one synchronous pipeline.
- `Parser` and `WebGLPreview` are also not cleanly split the way this repo's
  module boundaries require: constructing a `WebGLPreview` immediately wires
  up `Scene`/`Camera`/`WebGLRenderer`, so there's no DOM-free/Three.js-free
  parser entry point to import in isolation.

So per SPEC.md §8.1: not worker-safe, and not import-shaped for our module
boundaries either. Parsing is reimplemented here in TypeScript, run inside
`src/worker/` via a dedicated Worker module (see `src/worker/parser.worker.ts`).

Reused from `gcode-preview` as reference only (per SPEC.md §8, MIT-licensed):
- G2/G3 arc subdivision approach (I/J center-point form → polyline segments)
- Layer grouping strategy (comment-based, falling back to Z-height delta)

## Module contents

- `types.ts` — shared data shapes (`ParsedMove`, `Layer`, `ParseResult`, ...)
- `tokenizer.ts` — splits a raw G-code line into command + params + comment
- `state.ts` — tracks modal state (position mode, extrusion mode, units, E)
- `arcs.ts` — G2/G3 → line-segment subdivision
- `layers.ts` — layer-change detection (comment-based, Z-height fallback)
- `parse.ts` — top-level `parseGCode(text): ParseResult`, ties the above
  together. Pure function, no DOM, no Three.js, no Worker API — safe to unit
  test directly and safe to import from `src/worker/`.
