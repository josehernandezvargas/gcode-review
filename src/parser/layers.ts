import type { Layer, Move } from './types';

/** Builds layers from explicit slicer layer-change comment positions (preferred). */
export function buildLayersFromComments(breakPoints: number[], moves: Move[]): Layer[] {
  const points = Array.from(new Set([0, ...breakPoints.filter((p) => p > 0)])).sort(
    (a, b) => a - b,
  );

  const layers: Layer[] = [];
  for (let i = 0; i < points.length; i++) {
    const startMove = points[i];
    const endMove = i + 1 < points.length ? points[i + 1] : moves.length;
    if (startMove >= endMove) continue;
    layers.push({
      index: layers.length,
      z: moves[startMove].z1,
      startMove,
      endMove,
    });
  }
  return layers;
}

/** Fallback: groups moves by Z-height transitions when no layer comments are present. */
export function buildLayersFromZHeight(moves: Move[], tolerance = 0.01): Layer[] {
  if (moves.length === 0) return [];

  const layers: Layer[] = [];
  let currentZ = moves[0].z1;
  let startMove = 0;

  for (let i = 1; i < moves.length; i++) {
    const z = moves[i].z1;
    if (Math.abs(z - currentZ) > tolerance) {
      layers.push({ index: layers.length, z: currentZ, startMove, endMove: i });
      startMove = i;
      currentZ = z;
    }
  }
  layers.push({ index: layers.length, z: currentZ, startMove, endMove: moves.length });
  return layers;
}
