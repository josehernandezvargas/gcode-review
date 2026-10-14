# gcode-review
A standalone, browser-based viewer for reviewing G-code files.

- **Colours / light and dark mode:** all colours live in two files — the top of
  `src/ui/style.css` (page UI) and `src/render/colors.ts` (3D scene). See
  [`docs/theming.md`](docs/theming.md).
- **Script-generated files:** see [`docs/exporter-header.md`](docs/exporter-header.md)
  for the optional header the viewer reads, and what it deduces without one.
