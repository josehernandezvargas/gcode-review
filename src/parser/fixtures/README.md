Synthetic fixtures, not real output from `Rhino_PyWorkshop`'s export scripts
(this repo has no access to that codebase or its sample outputs — see
CLAUDE.md's "no dependency on that repo" rule). Each file targets a specific
dialect/edge case called out in SPEC.md §4 and §10:

- `cura_style.gcode` — Cura-style comments (`;LAYER:n`, `;TIME:`, `;Filament
  used:`), absolute extrusion (`M82`).
- `prusaslicer_style.gcode` — PrusaSlicer-style comments (`;LAYER_CHANGE`,
  `; estimated printing time`, `; filament used [mm]`/`[g]`), relative
  extrusion (`M83`), includes a `G2` arc.
- `no_comments.gcode` — no slicer comments at all, to verify graceful
  fallback to Z-height layer detection.

If real sample files from `wasp_delta.py`, `ultimaker.py`, or
`generic_gcode.py` become available, add them alongside these and prefer
them for the fixture-based tests.
