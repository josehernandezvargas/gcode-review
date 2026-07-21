import { tokenizeLine } from './tokenizer';
import { createInitialState, type ParserState } from './state';
import { subdivideArc } from './arcs';
import { buildLayersFromComments, buildLayersFromZHeight } from './layers';
import { collectMetadata, isLayerChangeComment, parseFeatureTypeComment } from './metadata';
import type { Bounds, Move, ParseResult, Vec3 } from './types';

/**
 * Parses raw G-code text into a flat list of line-segment moves plus layer
 * and bounds metadata. Pure function — no DOM, no Three.js, safe to call
 * from a Web Worker or a unit test.
 */
export function parseGCode(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const state = createInitialState();
  const moves: Move[] = [];
  const commentBreaks: number[] = [];
  const commentLines: string[] = [];
  let currentFeature: string | undefined;

  for (const rawLine of lines) {
    const tok = tokenizeLine(rawLine);

    if (tok.comment) {
      commentLines.push(tok.comment);
      if (isLayerChangeComment(tok.comment)) {
        commentBreaks.push(moves.length);
      }
      const featureType = parseFeatureTypeComment(tok.comment);
      if (featureType) currentFeature = featureType;
    }

    if (!tok.command) continue;
    applyCommand(tok.command, tok.params, state, moves, currentFeature);
  }

  const layers =
    commentBreaks.length > 0
      ? buildLayersFromComments(commentBreaks, moves)
      : buildLayersFromZHeight(moves);

  const metadata = collectMetadata(commentLines);
  if (state.nozzleTempC !== undefined) metadata.nozzleTempC = state.nozzleTempC;
  if (state.bedTempC !== undefined) metadata.bedTempC = state.bedTempC;

  return {
    moves,
    layers,
    bounds: computeBounds(moves),
    metadata,
    lineCount: lines.length,
  };
}

function applyCommand(
  command: string,
  params: Record<string, number>,
  state: ParserState,
  moves: Move[],
  feature: string | undefined,
): void {
  switch (command) {
    case 'G20':
      state.unitsScale = 25.4;
      return;
    case 'G21':
      state.unitsScale = 1;
      return;
    case 'G90':
      state.absolutePosition = true;
      return;
    case 'G91':
      state.absolutePosition = false;
      return;
    case 'M82':
      state.absoluteExtrusion = true;
      return;
    case 'M83':
      state.absoluteExtrusion = false;
      return;
    case 'M104':
    case 'M109':
      if (params.S !== undefined && state.nozzleTempC === undefined) state.nozzleTempC = params.S;
      return;
    case 'M140':
    case 'M190':
      if (params.S !== undefined && state.bedTempC === undefined) state.bedTempC = params.S;
      return;
    case 'G92':
      // Sets current position without moving — used to reset E, mainly.
      if (params.X !== undefined) state.x = params.X * state.unitsScale;
      if (params.Y !== undefined) state.y = params.Y * state.unitsScale;
      if (params.Z !== undefined) state.z = params.Z * state.unitsScale;
      if (params.E !== undefined) state.e = params.E * state.unitsScale;
      return;
    case 'G0':
    case 'G1':
      applyLinearMove(params, state, moves, feature);
      return;
    case 'G2':
    case 'G3':
      applyArcMove(command === 'G2', params, state, moves, feature);
      return;
    default:
      return;
  }
}

function resolveTarget(
  params: Record<string, number>,
  state: ParserState,
): { x: number; y: number; z: number; e: number } {
  const scale = state.unitsScale;
  const x =
    params.X !== undefined
      ? state.absolutePosition
        ? params.X * scale
        : state.x + params.X * scale
      : state.x;
  const y =
    params.Y !== undefined
      ? state.absolutePosition
        ? params.Y * scale
        : state.y + params.Y * scale
      : state.y;
  const z =
    params.Z !== undefined
      ? state.absolutePosition
        ? params.Z * scale
        : state.z + params.Z * scale
      : state.z;
  const e =
    params.E !== undefined
      ? state.absoluteExtrusion
        ? params.E * scale
        : state.e + params.E * scale
      : state.e;
  return { x, y, z, e };
}

function applyLinearMove(
  params: Record<string, number>,
  state: ParserState,
  moves: Move[],
  feature: string | undefined,
): void {
  const { x, y, z, e } = resolveTarget(params, state);
  const feedrate = params.F !== undefined ? params.F : state.feedrate;
  const extruding = e > state.e + 1e-9;

  if (x !== state.x || y !== state.y || z !== state.z || extruding) {
    moves.push({
      x0: state.x,
      y0: state.y,
      z0: state.z,
      x1: x,
      y1: y,
      z1: z,
      extruding,
      feedrate,
      feature,
    });
  }

  state.x = x;
  state.y = y;
  state.z = z;
  state.e = e;
  state.feedrate = feedrate;
}

function applyArcMove(
  clockwise: boolean,
  params: Record<string, number>,
  state: ParserState,
  moves: Move[],
  feature: string | undefined,
): void {
  const scale = state.unitsScale;
  const { x, y, z, e } = resolveTarget(params, state);
  const i = (params.I ?? 0) * scale;
  const j = (params.J ?? 0) * scale;
  const feedrate = params.F !== undefined ? params.F : state.feedrate;
  const extruding = e > state.e + 1e-9;

  const points = subdivideArc({
    start: { x: state.x, y: state.y, z: state.z },
    end: { x, y, z },
    i,
    j,
    clockwise,
  });

  let prev: Vec3 = { x: state.x, y: state.y, z: state.z };
  for (const point of points) {
    moves.push({
      x0: prev.x,
      y0: prev.y,
      z0: prev.z,
      x1: point.x,
      y1: point.y,
      z1: point.z,
      extruding,
      feedrate,
      feature,
    });
    prev = point;
  }

  state.x = x;
  state.y = y;
  state.z = z;
  state.e = e;
  state.feedrate = feedrate;
}

function computeBounds(moves: Move[]): Bounds {
  if (moves.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }

  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };

  for (const m of moves) {
    min.x = Math.min(min.x, m.x0, m.x1);
    min.y = Math.min(min.y, m.y0, m.y1);
    min.z = Math.min(min.z, m.z0, m.z1);
    max.x = Math.max(max.x, m.x0, m.x1);
    max.y = Math.max(max.y, m.y0, m.y1);
    max.z = Math.max(max.z, m.z0, m.z1);
  }

  return { min, max };
}
