# Recommended G-code header for script-generated (Rhino/GH) files

The viewer renders any file without a header — nothing here is required.
But files like `20260605_E3D_gradient_test2.gcode` carry no metadata at all,
so the viewer has to *measure* everything (layer height from Z steps, scale
class from bounding box) and can't know things geometry doesn't reveal (bead
width, machine volume, material). A small comment header fixes that at the
exporter side.

`gcodelib.save_gcode_file(base_dir, filename, header, commands, ...)` already
accepts a `header` list — `generic_gcode.py` currently passes `[]`. Build the
list instead:

```python
header = [
    ";Generated with Rhino_PyWorkshop generic_gcode.py",
    f";Created: {gl.timestamp(format=2)}",
    ";Machine: RISE E3D gantry",          # free text, shown in the sidebar
    ";Origin: center",                     # "center" or "corner"
    ";Build volume: 1200 x 600 x 600",     # mm; drives the plate/volume box
    ";Material: Concrete",
    f";Layer height: {layer_height}",      # mm
    f";Bead width: {bead_width}",          # mm; drives tube rendering width
    f";Layer count: {layer}",
    f";Path length: {round(E, 1)}",        # mm, total toolpath length
    ";E mode: path-distance-mm",           # documents what the E axis means
]
```

## Keys the viewer parses

| Header line | Effect in the viewer |
| --- | --- |
| `;Generated with <name>` | "Slicer" sidebar row (already supported) |
| `;Created: <text>` | "Created" sidebar row (raw string, not reformatted) |
| `;Machine: <name>` | Machine name in sidebar and machine dropdown |
| `;Origin: center\|corner` | Positions the build plate around (0,0) or a front-left corner |
| `;Build volume: X x Y x Z` | Adds a "from file" machine profile: plate, volume box, fits-check |
| `;Material: <name>` | "Material" sidebar row |
| `;Layer height: <mm>` | Default vertical bead size (else measured from Z steps) |
| `;Bead width: <mm>` (or `;Extrusion width:`) | Default horizontal bead size (else 2× layer height) |

Unknown keys are harmless — they're kept in `metadata.raw` and ignored.
`;Layer count:`, `;Path length:`, and `;E mode:` aren't parsed today; they're
in the recommendation because they cost nothing to emit and make the files
self-describing for other tools (the viewer independently derives layer count
and extruded path length from the moves).

## What a headless file gets anyway

The header is a recommendation, not a requirement. A file with nothing but
`;Layer n` markers and `G1` moves — no `G21`/`G90`/`M82`, no feedrates, no
comments (`public/gcode/20260605_E3D_gradient_test2.gcode` is exactly this)
— still renders correctly, because everything below is derived from the
toolpath itself:

| Property | How it's deduced when undeclared |
|---|---|
| Units / positioning / extrusion mode | Assumed mm, absolute, absolute (`G21`/`G90`/`M82` defaults) |
| Layer height | Median Z step between layers (`detectedLayerHeightMm`) |
| Bead width | 2 × layer height |
| Print size | Bounding box of the **extruding** moves (`extrusionBounds`) |
| Build volume | None assumed — the plate, grid and camera fit the print instead |
| Scale profile | Large-format when layer height ≥ 2mm or the printed span > 800mm |

Two consequences worth knowing:

- **The bounding box ignores travel.** Nothing homes the machine, so the
  first move is drawn from an assumed `(0,0,0)` the nozzle was never at.
  That phantom segment stays out of the reported print size — for the E3D
  gradient file the box is 1100 × 47 × **504**mm, not 512.
- **No build volume is invented.** Declaring one (`;Build volume:`) is what
  turns on the out-of-volume collision check; without it the viewer sizes
  itself to the print and checks only what it can see.

Declared values always win over deduced ones, and deduced values are
labelled as such in the sidebar ("8.0 mm (measured)", "16.0 mm (2 × layer
height)") so they can't be mistaken for something the file said.

## Improvements beyond the header

1. **Emit feedrates.** No `F` words appear in the E3D output, so print-time
   estimation is impossible and the viewer's "Color by speed" mode is flat.
   `gcodelib.gcodeline` already takes `f=`; even a constant nominal feedrate
   per file would help, and a per-move one enables gradient inspection.
2. **Distinguish travel from deposition explicitly.** Today the only signal
   is "E didn't increase". If the E3D system has a pump on/off command,
   emitting it (even as a comment like `;Pump: off`) would make travel
   detection robust — e.g. the diagonal move up between layers currently
   renders as travel only because E stays constant across it.
3. **Keep `;Layer n` markers** — the viewer now parses them natively (it
   previously only knew Cura's `;LAYER:n` and PrusaSlicer's
   `;LAYER_CHANGE`). One marker per Z step is exactly right.
4. **Consider one decimal more precision.** Coordinates and E are rounded to
   0.1mm, which is fine at this scale, but E deltas of short segments can
   round to 0 and misclassify a short deposition move as travel.
