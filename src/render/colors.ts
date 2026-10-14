import * as THREE from 'three';

/**
 * ============================================================================
 *  COLOUR SETTINGS — 3D scene
 * ============================================================================
 *
 * Every colour drawn inside the 3D canvas is defined in this file. (Colours
 * for the page around it — sidebar, buttons, start screen — are CSS custom
 * properties at the top of src/ui/style.css. See docs/theming.md.)
 *
 * Two groups:
 *
 * 1. SCENE_THEMES — scenery that has to change with light/dark mode:
 *    background, build plate, grid, scale bar, bounding box, measurement
 *    overlay. Edit a value here and it applies the next time the theme is
 *    switched or a file is loaded.
 *
 * 2. Toolpath data colours (EXTRUSION_COLOR and below) — what the toolpath
 *    itself is painted with. These are the same in both themes on purpose:
 *    "orange = extrusion" or "red = infill" should not change meaning when
 *    you flip the background.
 */

export type Theme = 'dark' | 'light';

/** Scene colours that depend on the UI theme. Hex numbers are Three.js colours; strings are CSS colours for canvas-drawn text. */
export interface SceneTheme {
  background: number;
  buildPlate: number;
  buildPlateOpacity: number;
  gridMajor: number;
  gridMinor: number;
  /** Wireframe of a selected machine's print volume. */
  volumeBox: number;
  /** Scale-bar ticks and their "Nmm" labels. */
  scaleBar: string;
  /** Wireframe drawn around the printed part ("Show bounding box"). */
  boundingBox: number;
  boundingBoxLabel: string;
  /** Measurement markers, span line and distance label. */
  measure: number;
  measureLabel: string;
}

export const SCENE_THEMES: Record<Theme, SceneTheme> = {
  dark: {
    background: 0x1a1a1a,
    buildPlate: 0x444444,
    buildPlateOpacity: 0.3,
    gridMajor: 0x666666,
    gridMinor: 0x333333,
    volumeBox: 0x6688aa,
    scaleBar: '#cfd8dc',
    boundingBox: 0x66d9a0,
    boundingBoxLabel: '#8ce8c0',
    measure: 0xffffff,
    measureLabel: '#ffffff',
  },
  light: {
    background: 0xf3f4f6,
    buildPlate: 0xcfd4da,
    buildPlateOpacity: 0.55,
    gridMajor: 0x9aa1aa,
    gridMinor: 0xd5d9de,
    volumeBox: 0x4a6a8f,
    scaleBar: '#37474f',
    boundingBox: 0x0f8a5f,
    boundingBoxLabel: '#0b6e4b',
    measure: 0x1d1d1f,
    measureLabel: '#1d1d1f',
  },
};

// ---- Toolpath data colours (theme-independent) ------------------------------

export const EXTRUSION_COLOR = new THREE.Color(0xff8c1a);
export const TRAVEL_COLOR = new THREE.Color(0x3399ff);
/** Highlight accent for the current-point marker shown in Points scrub mode. */
export const POINT_MARKER_COLOR = 0x00ffa2;

/** Analysis issue markers, by issue kind (see src/analysis). */
export const ISSUE_COLORS = {
  'out-of-volume': 0xff3b30,
  'below-plate': 0xff9500,
  'travel-collision': 0xff00aa,
} as const;

/** Measurement tool's per-axis breakdown: ΔX, ΔY, ΔZ segments. */
export const MEASURE_AXIS_COLORS = {
  x: 0xff5555,
  y: 0x55dd55,
  z: 0x5599ff,
} as const;

const SPEED_HUE_LOW = 240 / 360; // blue
const SPEED_HUE_HIGH = 0; // red

/** Maps a feedrate into a blue (slow) -> red (fast) gradient, given the file's min/max. */
export function speedToColor(feedrate: number, min: number, max: number, out = new THREE.Color()): THREE.Color {
  const t = max > min ? Math.min(1, Math.max(0, (feedrate - min) / (max - min))) : 0;
  const hue = SPEED_HUE_LOW + (SPEED_HUE_HIGH - SPEED_HUE_LOW) * t;
  return out.setHSL(hue, 0.9, 0.5);
}

/** Maps a layer index into a repeating rainbow sweep, so adjacent layers are visually distinct. */
export function layerToColor(layerIndex: number, totalLayers: number, out = new THREE.Color()): THREE.Color {
  const denom = Math.max(1, totalLayers);
  const hue = (layerIndex % denom) / denom;
  return out.setHSL(hue, 0.7, 0.55);
}

// Canonical feature-type colors, keyed by substrings found in Cura/PrusaSlicer/Slic3r
// `;TYPE:` comments (which use different casing/wording for the same concepts).
const FEATURE_COLOR_RULES: Array<{ match: RegExp; color: THREE.Color }> = [
  { match: /wall-outer|outer wall|perimeter(?!.*inner)/i, color: new THREE.Color(0xffb000) },
  { match: /wall-inner|inner wall/i, color: new THREE.Color(0xffd699) },
  { match: /skin|top.?solid|solid infill|top surface/i, color: new THREE.Color(0xe0e000) },
  { match: /fill|infill/i, color: new THREE.Color(0xff5050) },
  { match: /support/i, color: new THREE.Color(0x8080ff) },
  { match: /skirt|brim/i, color: new THREE.Color(0x50e0e0) },
  { match: /bridge/i, color: new THREE.Color(0xff00ff) },
];
const FEATURE_FALLBACK_COLOR = new THREE.Color(0x999999);

/** Maps a slicer feature/type tag to a canonical color; unknown/missing tags fall back to gray. */
export function featureToColor(feature: string | undefined, out = new THREE.Color()): THREE.Color {
  if (!feature) return out.copy(FEATURE_FALLBACK_COLOR);
  for (const rule of FEATURE_COLOR_RULES) {
    if (rule.match.test(feature)) return out.copy(rule.color);
  }
  return out.copy(FEATURE_FALLBACK_COLOR);
}
