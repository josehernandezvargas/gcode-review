/**
 * Print-scale framework: desktop FDM and large-format (3DCP/concrete) files
 * need different bead-size defaults, slider ranges, and volume assumptions.
 * A ScaleProfile bundles those so the UI can reconfigure itself per file
 * instead of hardcoding desktop-printer numbers. Pure data — no Three.js/DOM,
 * safe to import from src/render and src/ui alike.
 */
import type { Bounds, ParseResult } from '../parser';

export interface SliderRange {
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface ScaleProfile {
  id: 'desktop' | 'large-format';
  name: string;
  /** Horizontal bead width (nozzle/bead diameter), mm. */
  beadWidth: SliderRange;
  /** Vertical bead height (layer height), mm. */
  layerHeight: SliderRange;
  /**
   * Bead width to assume when the file declares none, as a multiple of layer
   * height. 3DCP beads are typically ~2x wider than tall; desktop nozzles are
   * ~2x the layer height too, so one ratio serves both.
   */
  beadWidthToLayerHeightRatio: number;
}

export const DESKTOP_PROFILE: ScaleProfile = {
  id: 'desktop',
  name: 'Desktop FDM',
  beadWidth: { min: 0.1, max: 2.0, step: 0.05, default: 0.4 },
  layerHeight: { min: 0.05, max: 1.0, step: 0.05, default: 0.2 },
  beadWidthToLayerHeightRatio: 2,
};

export const LARGE_FORMAT_PROFILE: ScaleProfile = {
  id: 'large-format',
  name: 'Large format (3DCP)',
  beadWidth: { min: 2, max: 120, step: 0.5, default: 30 },
  layerHeight: { min: 1, max: 60, step: 0.5, default: 10 },
  beadWidthToLayerHeightRatio: 2,
};

// Above either threshold a file cannot plausibly be desktop FDM: no desktop
// build plate spans 800mm, and no desktop printer lays 2mm layers.
const LARGE_FORMAT_SPAN_MM = 800;
const LARGE_FORMAT_LAYER_HEIGHT_MM = 2;

/**
 * Picks the scale profile for a parsed file from its measured geometry:
 * XY span and layer height (declared if present, else detected). Never needs
 * header metadata — a bare large-scale file still classifies correctly.
 */
export function classifyScale(result: ParseResult): ScaleProfile {
  const layerHeight = result.metadata.layerHeightMm ?? result.detectedLayerHeightMm ?? 0;
  if (layerHeight >= LARGE_FORMAT_LAYER_HEIGHT_MM) return LARGE_FORMAT_PROFILE;
  if (maxHorizontalSpan(printBounds(result)) > LARGE_FORMAT_SPAN_MM) return LARGE_FORMAT_PROFILE;
  return DESKTOP_PROFILE;
}

function maxHorizontalSpan(bounds: Bounds): number {
  return Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
}

/**
 * The bounds that describe the printed part, which is what the plate, camera
 * framing and bounding-box overlay should all size themselves to. Extrusion
 * bounds when the file deposits anything, since travel (and a headless file's
 * assumed (0,0,0) start) otherwise inflates the box past the real part.
 */
export function printBounds(result: ParseResult): Bounds {
  return result.extrusionBounds ?? result.bounds;
}

/** True when the file declares no bead width and the rendered one was derived from layer height. */
export function isBeadWidthDerived(result: ParseResult): boolean {
  return result.metadata.nozzleDiameterMm === undefined;
}

/**
 * Resolves the bead width/layer height to render a file with, preferring
 * declared metadata, then geometry detected from the file, then the profile's
 * ratio/defaults. Results are clamped to the profile's slider range so the
 * sliders always agree with what's shown.
 */
export function resolveBeadSize(
  result: ParseResult,
  profile: ScaleProfile,
): { beadWidthMm: number; layerHeightMm: number } {
  const layerHeightMm = clamp(
    result.metadata.layerHeightMm ?? result.detectedLayerHeightMm ?? profile.layerHeight.default,
    profile.layerHeight,
  );
  const beadWidthMm = clamp(
    result.metadata.nozzleDiameterMm ?? layerHeightMm * profile.beadWidthToLayerHeightRatio,
    profile.beadWidth,
  );
  return { beadWidthMm, layerHeightMm };
}

function clamp(value: number, range: SliderRange): number {
  return Math.max(range.min, Math.min(value, range.max));
}
