import * as THREE from 'three';

export const EXTRUSION_COLOR = new THREE.Color(0xff8c1a);
export const TRAVEL_COLOR = new THREE.Color(0x3399ff);
export const BUILD_PLATE_COLOR = 0x444444;
export const GRID_COLOR_MAJOR = 0x666666;
export const GRID_COLOR_MINOR = 0x333333;

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
