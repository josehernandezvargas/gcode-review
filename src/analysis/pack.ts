import type { Layer, Move } from '../parser';

/**
 * The move list flattened into typed arrays. Analysis runs over hundreds of
 * thousands of moves, so it works on this rather than on the object array:
 * it is cache-friendly, and structured-cloning it to the analysis worker
 * costs a memcpy instead of deserialising 200k objects.
 */
export interface PackedToolpath {
  moveCount: number;
  /** x0, y0, z0, x1, y1, z1 per move. */
  positions: Float32Array;
  /** 1 when the move extrudes, 0 for travel. */
  extruding: Uint8Array;
  /** Layer index per move. */
  layerIndex: Uint32Array;
  /** Nominal Z per layer. */
  layerZ: Float32Array;
  /** First move index of each layer (inclusive). */
  layerStart: Uint32Array;
  /** Last move index of each layer (exclusive). */
  layerEnd: Uint32Array;
}

/** Flattens parsed moves + layers into typed arrays. O(n), no allocation per move. */
export function packToolpath(moves: Move[], layers: Layer[]): PackedToolpath {
  const moveCount = moves.length;
  const positions = new Float32Array(moveCount * 6);
  const extruding = new Uint8Array(moveCount);
  const layerIndex = new Uint32Array(moveCount);

  let layerCursor = 0;
  for (let i = 0; i < moveCount; i++) {
    while (layerCursor < layers.length - 1 && i >= layers[layerCursor].endMove) layerCursor++;
    const m = moves[i];
    const o = i * 6;
    positions[o] = m.x0;
    positions[o + 1] = m.y0;
    positions[o + 2] = m.z0;
    positions[o + 3] = m.x1;
    positions[o + 4] = m.y1;
    positions[o + 5] = m.z1;
    extruding[i] = m.extruding ? 1 : 0;
    layerIndex[i] = layerCursor;
  }

  const layerZ = new Float32Array(layers.length);
  const layerStart = new Uint32Array(layers.length);
  const layerEnd = new Uint32Array(layers.length);
  for (let i = 0; i < layers.length; i++) {
    layerZ[i] = layers[i].z;
    layerStart[i] = layers[i].startMove;
    layerEnd[i] = layers[i].endMove;
  }

  return { moveCount, positions, extruding, layerIndex, layerZ, layerStart, layerEnd };
}

/**
 * Distinct toolpath vertices, in file order: every move's start plus the
 * final move's end. Used as snap targets by the measurement tool.
 */
export function extractVertices(packed: PackedToolpath): Float32Array {
  const { moveCount, positions } = packed;
  if (moveCount === 0) return new Float32Array(0);

  const out = new Float32Array((moveCount + 1) * 3);
  for (let i = 0; i < moveCount; i++) {
    const o = i * 6;
    out[i * 3] = positions[o];
    out[i * 3 + 1] = positions[o + 1];
    out[i * 3 + 2] = positions[o + 2];
  }
  const last = (moveCount - 1) * 6;
  out[moveCount * 3] = positions[last + 3];
  out[moveCount * 3 + 1] = positions[last + 4];
  out[moveCount * 3 + 2] = positions[last + 5];
  return out;
}
