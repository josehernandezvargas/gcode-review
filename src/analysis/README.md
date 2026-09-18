# Analysis — toolpath checks

Static checks over an already-parsed toolpath: build-volume violations and
nozzle/travel collisions, plus the derived numbers the Analysis panel shows.

Pure functions, like `src/parser/`. No DOM, no Three.js — so this runs
unchanged in `src/worker/analysis.worker.ts` and in unit tests. It is a
separate module from the parser because it is not parsing: it consumes
`ParseResult`, and nothing in the parser depends on it.

## Data shape

Checks run over `PackedToolpath` (`pack.ts`) rather than the `Move[]` object
array:

- typed arrays are cache-friendly for the tight loops here, and
- structured-cloning them into the analysis worker is a memcpy, instead of
  deserialising a few hundred thousand objects.

`extractVertices()` reuses the same packed positions as snap targets for the
measurement tool, so there is one copy of the geometry on the main thread.

## Checks

| Kind | What it flags |
|---|---|
| `out-of-volume` | A move endpoint outside the selected machine's build volume. Skipped entirely when "Fit to model" is selected — there is no volume to be outside of. |
| `below-plate` | A move with Z below 0, whatever the machine. |
| `travel-collision` | A travel that stays at or below the height of material already deposited **on the same layer** and crosses one of those beads — the nozzle would drag through it. |

The travel check indexes each layer's beads into a 4mm XY grid as they are
deposited, so a travel only tests against segments printed before it, in the
cells it actually passes through (`walkCells`, Amanatides–Woo). Intersections
within `endpointToleranceMm` of the travel's own endpoints are ignored: a
travel always starts where the last bead ended and ends where the next one
begins, which touches without colliding.

A file full of `travel-collision` hits usually means the slicer had both
Z-hop and avoid-crossing-perimeters switched off — common, and not
necessarily wrong. It is reported as a count with a bounded sample, not as an
error.

## Limits

These checks see the toolpath and an axis-aligned build volume. They do not
model the gantry, carriage, part-cooling ducts, bed clips or anything else
physical that the G-code does not describe, and they do not check collisions
against *previous* layers (only the layer being printed). Treat the results
as advisory.

Two budgets bound the work on pathological files: `PAIR_TEST_BUDGET` caps
total segment-pair tests, and `MAX_CELLS_PER_WALK` caps a single grid walk.
When the first is hit, the report comes back with `truncated: true` and the
UI says counts are a lower bound.
