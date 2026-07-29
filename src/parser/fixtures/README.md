Synthetic fixtures, kept small and self-contained for fast unit tests. Each
file targets a specific dialect/edge case called out in SPEC.md §4 and §10:

- `cura_style.gcode` — Cura-style comments (`;LAYER:n`, `;TIME:`, `;Filament
  used:`), absolute extrusion (`M82`).
- `prusaslicer_style.gcode` — PrusaSlicer-style comments (`;LAYER_CHANGE`,
  `; estimated printing time`, `; filament used [mm]`/`[g]`), relative
  extrusion (`M83`), includes a `G2` arc.
- `ultimaker_style.gcode` — mirrors the colon-style header used by the real
  sample files in `public/gcode/` (see below): `;NOZZLE_DIAMETER:`,
  `;TARGET_MACHINE.NAME:`, `;MATERIAL:`, and the two-line
  `;File created <date>` / `; at <time>` pair.
- `no_comments.gcode` — no slicer comments at all, to verify graceful
  fallback to Z-height layer detection.

Real sample files are now available in `public/gcode/` — actual output from
the user's own bioprinting export script (also served in the UI as example
files, via `src/ui/examples.ts`). They're much larger than these fixtures
(thousands of lines), so the unit tests still use the small dialect-specific
fixtures above; `ultimaker_style.gcode` exists specifically to keep that
dialect covered by a fast test without loading the full real files.
