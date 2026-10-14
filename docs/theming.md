# Theming — where the colours live

Every colour in the app is defined in exactly **two files**. Nothing else in
the codebase contains a colour literal (the only exception is the white
scene lights in `src/render/scene.ts`, which are illumination, not palette).

| What you want to change | File | Where |
|---|---|---|
| Page UI, dark theme — start screen, sidebar, controls, buttons, panels | `src/ui/style.css` | `:root { … }` block at the top |
| Page UI, light theme | `src/ui/style.css` | `:root[data-theme='light'] { … }`, right below it |
| 3D scene, per theme — background, build plate, grid, scale bar, machine volume box, bounding-box overlay, measurement overlay | `src/render/colors.ts` | `SCENE_THEMES` (`dark` / `light` entries) |
| Toolpath itself — extrusion, travel, point marker | `src/render/colors.ts` | `EXTRUSION_COLOR`, `TRAVEL_COLOR`, `POINT_MARKER_COLOR` |
| "Color by speed / layer / feature type" palettes | `src/render/colors.ts` | `SPEED_HUE_*`, `layerToColor`, `FEATURE_COLOR_RULES` |
| Analysis issue markers and measurement ΔX/ΔY/ΔZ axes | `src/render/colors.ts` | `ISSUE_COLORS`, `MEASURE_AXIS_COLORS` |

Both files open with a `COLOUR SETTINGS` banner comment pointing at the
other, so whichever one you land in tells you about the second.

## Why two files

The page is HTML and is coloured with CSS. The 3D canvas is drawn by
Three.js, which can't read CSS variables, so its colours are numbers in
TypeScript. One file per rendering technology.

## Page tokens (`style.css`)

Rules further down the stylesheet only ever reference tokens, so changing
one token restyles every element that uses it:

| Token | Used for |
|---|---|
| `--bg` | Page background |
| `--surface` | Sidebar, controls bar, header, drop zone, example cards |
| `--surface-sunken` | Settings panel, analysis issue rows |
| `--surface-raised` / `--surface-hover` | Buttons and selects, at rest / hovered |
| `--border` / `--border-strong` | Dividers / control and drop-zone outlines |
| `--text` / `--text-muted` / `--text-subtle` | Primary / secondary / tertiary text |
| `--accent`, `--accent-hover`, `--accent-contrast`, `--accent-soft` | Links, focus rings, pressed toggles, sliders and checkboxes (via `accent-color`), drop-zone hover |
| `--success`, `--danger`, `--warning*` | "No issues" note, issue counts, out-of-volume banner |
| `--shadow` | Example cards |

`color-scheme` is set per theme too, which is what makes the browser's own
widgets — select dropdowns, range sliders, scrollbars — follow along.

## Data colours don't change with the theme

The toolpath colours (`EXTRUSION_COLOR` and everything below it in
`colors.ts`) are deliberately the same in light and dark mode: "orange means
extrusion" or "red means infill" shouldn't change meaning when the background
flips. Only the scenery around the toolpath is themed. If you add a colour
that sits *behind or around* the toolpath, put it in `SCENE_THEMES`; if it
*encodes data*, put it with the data colours.

## How switching works

- `src/ui/theme.ts` picks the starting theme (the saved choice, else the OS
  `prefers-color-scheme`), saves changes to `localStorage`, and sets
  `<html data-theme="…">` — which is what swaps the CSS token block.
- On a switch, `src/main.ts` also calls `viewerScene.setTheme()`,
  `measureTool.setTheme()` and rebuilds the bounding-box overlay, so the 3D
  scene repaints in place. The camera doesn't move.
- `index.html` has a few lines of inline script in `<head>` that set
  `data-theme` before first paint, so a light-mode visitor never sees a flash
  of the dark page while the app loads. It mirrors `resolveInitialTheme()` —
  keep the `localStorage` key in step if you rename it.

## Adding a third theme

1. Add a `:root[data-theme='<name>'] { … }` token block to `style.css`.
2. Add `<name>` to the `Theme` type and an entry to `SCENE_THEMES` in
   `colors.ts` — TypeScript will refuse to build until every `SceneTheme`
   field has a value.
3. Change `toggle()` in `src/ui/theme.ts` to cycle through the themes, and
   the inline script in `index.html` to accept the new name.
