export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A single straight-line segment of the toolpath (arcs are pre-subdivided into these). */
export interface Move {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  extruding: boolean;
  feedrate: number;
  /** Slicer feature/type tag from the nearest preceding `;TYPE:` comment (e.g. "WALL-OUTER", "FILL"), if any. */
  feature?: string;
}

export interface Layer {
  index: number;
  z: number;
  /** Index into ParseResult.moves, inclusive. */
  startMove: number;
  /** Index into ParseResult.moves, exclusive. */
  endMove: number;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export interface ParseMetadata {
  slicer?: string;
  printTimeSeconds?: number;
  filamentUsedMm?: number;
  filamentUsedGrams?: number;
  /** First nozzle/bed set-temperature seen (M104/M109/M140/M190) — actual commands, not comments. */
  nozzleTempC?: number;
  bedTempC?: number;
  layerHeightMm?: number;
  nozzleDiameterMm?: number;
  filamentType?: string;
  /** All comment lines encountered, unparsed — kept for display/debugging fallback. */
  raw: string[];
}

export interface ParseResult {
  moves: Move[];
  layers: Layer[];
  bounds: Bounds;
  metadata: ParseMetadata;
  lineCount: number;
}
