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
  /** Target printer name/model as declared by the slicer (Cura's TARGET_MACHINE.NAME, PrusaSlicer's printer_model). */
  machineName?: string;
  /** File creation date/time, as declared by the slicer/script (raw string, not reformatted). */
  createdAt?: string;
  /** Deposited material as declared in a custom `;Material:` header (e.g. "Concrete", "Clay"). */
  material?: string;
  /** Machine build volume in mm, from a custom `;Build volume: X x Y x Z` header. */
  buildVolume?: Vec3;
  /** Where the machine's XY origin sits, from a custom `;Origin:` header. */
  originMode?: 'center' | 'corner';
  /** All comment lines encountered, unparsed — kept for display/debugging fallback. */
  raw: string[];
}

export interface ParseResult {
  moves: Move[];
  layers: Layer[];
  bounds: Bounds;
  metadata: ParseMetadata;
  lineCount: number;
  /**
   * Median Z step between consecutive layers, measured from the toolpath
   * itself. Distinct from metadata.layerHeightMm (which the file declares) —
   * this is derived geometry, used as a fallback for bead rendering defaults.
   */
  detectedLayerHeightMm?: number;
  /** Total XYZ path length of extruding moves, in mm. For 3DCP-style files whose E axis tracks path distance, this is the deposition length. */
  totalExtrusionDistanceMm: number;
  /**
   * Bounds of extruding moves only — the printed part, without travel.
   * Headless files start from an assumed (0,0,0) and park off to one side, so
   * `bounds` can be noticeably larger than anything actually deposited.
   * Undefined when the file deposits nothing.
   */
  extrusionBounds?: Bounds;
}
