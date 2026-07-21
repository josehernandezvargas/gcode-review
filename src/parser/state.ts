export interface ParserState {
  x: number;
  y: number;
  z: number;
  e: number;
  /** G90 = true (absolute), G91 = false (relative). */
  absolutePosition: boolean;
  /** M82 = true (absolute), M83 = false (relative). */
  absoluteExtrusion: boolean;
  /** G21 = 1 (mm), G20 = 25.4 (inch -> mm). */
  unitsScale: number;
  feedrate: number;
  /** First M104/M109 S value seen, if any. */
  nozzleTempC?: number;
  /** First M140/M190 S value seen, if any. */
  bedTempC?: number;
}

export function createInitialState(): ParserState {
  return {
    x: 0,
    y: 0,
    z: 0,
    e: 0,
    absolutePosition: true,
    absoluteExtrusion: true,
    unitsScale: 1,
    feedrate: 0,
  };
}
