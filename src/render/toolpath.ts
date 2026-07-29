import * as THREE from 'three';
import type { Layer, Move } from '../parser';
import { EXTRUSION_COLOR, POINT_MARKER_COLOR, TRAVEL_COLOR, featureToColor, layerToColor, speedToColor } from './colors';

export type ColorMode = 'move-type' | 'speed' | 'layer' | 'feature';
export type RenderMode = 'lines' | 'tubes';

export const DEFAULT_EXTRUSION_WIDTH = 0.4; // mm, matches a common 0.4mm nozzle
export const MIN_EXTRUSION_WIDTH = 0.1;
export const MAX_EXTRUSION_WIDTH = 2.0;
export const DEFAULT_LAYER_HEIGHT = 0.2; // mm, a common FDM default
export const MIN_LAYER_HEIGHT = 0.05;
export const MAX_LAYER_HEIGHT = 1.0;
const TUBE_RADIAL_SEGMENTS = 6;

export interface LayerCount {
  extrusion: number;
  travel: number;
}

export interface Toolpath {
  /** Single object to add/remove from the scene; internally swaps lines <-> tubes. */
  object: THREE.Object3D;
  totalMoves: number;
  layerCount: number;
  setVisibleThroughLayer(layerIndex: number): void;
  setVisibleThroughMove(moveIndex: number): void;
  setShowTravel(show: boolean): void;
  setColorMode(mode: ColorMode): void;
  setRenderMode(mode: RenderMode): void;
  /** Horizontal bead width (nozzle diameter) — the tube's cross-section is wider than it is tall. */
  setExtrusionWidth(width: number): void;
  /** Vertical bead height (layer height) — the tube's cross-section is wider than it is tall. */
  setLayerHeight(height: number): void;
  /** Shows/hides the highlighted sphere marking the last revealed point (Points scrub mode). */
  setPointMarkerVisible(visible: boolean): void;
  dispose(): void;
}

/** Per-subset context a color mode needs to resolve a move's color. */
interface ColorContext {
  minFeedrate: number;
  maxFeedrate: number;
  totalLayers: number;
  /** Layer index of each move, parallel to the move subset being colored. */
  layerIndexFor: number[];
}

function resolveMoveColor(
  move: Move,
  index: number,
  mode: ColorMode,
  fallback: THREE.Color,
  ctx: ColorContext,
  out: THREE.Color,
): THREE.Color {
  switch (mode) {
    case 'speed':
      return speedToColor(move.feedrate, ctx.minFeedrate, ctx.maxFeedrate, out);
    case 'layer':
      return layerToColor(ctx.layerIndexFor[index], ctx.totalLayers, out);
    case 'feature':
      return featureToColor(move.feature, out);
    default:
      return out.copy(fallback);
  }
}

/**
 * G-code is Z-up (X/Y horizontal, Z vertical); Three.js's convention here is
 * Y-up. Map gcode (x, y, z) -> three (x, z, -y): a -90deg rotation about X
 * that keeps the scene right-handed.
 */
function toSceneVec(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(x, z, -y);
}

function writePosition(positions: Float32Array, offset: number, x: number, y: number, z: number): void {
  positions[offset] = x;
  positions[offset + 1] = z;
  positions[offset + 2] = -y;
}

function buildLineGeometry(moves: Move[]): THREE.BufferGeometry {
  const positions = new Float32Array(moves.length * 6);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const o = i * 6;
    writePosition(positions, o, m.x0, m.y0, m.z0);
    writePosition(positions, o + 3, m.x1, m.y1, m.z1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(moves.length * 6), 3));
  return geometry;
}

function applyLineColors(
  geometry: THREE.BufferGeometry,
  moves: Move[],
  mode: ColorMode,
  fallback: THREE.Color,
  ctx: ColorContext,
): void {
  const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
  const colors = colorAttr.array as Float32Array;
  const tmp = new THREE.Color();

  for (let i = 0; i < moves.length; i++) {
    const color = resolveMoveColor(moves[i], i, mode, fallback, ctx, tmp);
    const o = i * 6;
    colors[o] = color.r;
    colors[o + 1] = color.g;
    colors[o + 2] = color.b;
    colors[o + 3] = color.r;
    colors[o + 4] = color.g;
    colors[o + 5] = color.b;
  }
  colorAttr.needsUpdate = true;
}

/** Builds one oriented, elliptically-scaled cylinder instance per move, standing in for a tube segment. */
function buildTubeMesh(moves: Move[], widthRadius: number, heightRadius: number): THREE.InstancedMesh {
  const geometry = new THREE.CylinderGeometry(1, 1, 1, TUBE_RADIAL_SEGMENTS, 1, true);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, moves.length));
  mesh.count = moves.length;
  updateTubeTransforms(mesh, moves, widthRadius, heightRadius);
  return mesh;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_X = new THREE.Vector3(1, 0, 0);

/**
 * Picks a stable perpendicular basis for a travel direction: `right` is
 * horizontal (perpendicular to both the direction and world-up — this is
 * the bead's "width" axis), `up` is whatever's left (the bead's "height"
 * axis, close to vertical except for near-vertical moves like Z-hops).
 */
function computeCrossSectionBasis(direction: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
  right.crossVectors(direction, WORLD_UP);
  if (right.lengthSq() < 1e-8) right.crossVectors(direction, WORLD_X); // direction ~parallel to world-up
  right.normalize();
  up.crossVectors(right, direction).normalize();
}

function updateTubeTransforms(
  mesh: THREE.InstancedMesh,
  moves: Move[],
  widthRadius: number,
  heightRadius: number,
): void {
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    toSceneVec(m.x0, m.y0, m.z0, start);
    toSceneVec(m.x1, m.y1, m.z1, end);
    direction.subVectors(end, start);
    const length = direction.length();
    midpoint.addVectors(start, end).multiplyScalar(0.5);

    if (length < 1e-6) {
      scale.set(0, 0, 0);
      quaternion.identity();
    } else {
      direction.divideScalar(length);
      computeCrossSectionBasis(direction, right, up);
      // Cylinder's local axes: X/Z are the circular cross-section, Y is its length.
      basis.makeBasis(right, direction, up);
      quaternion.setFromRotationMatrix(basis);
      scale.set(widthRadius, length, heightRadius);
    }

    matrix.compose(midpoint, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function applyTubeColors(
  mesh: THREE.InstancedMesh,
  moves: Move[],
  mode: ColorMode,
  fallback: THREE.Color,
  ctx: ColorContext,
): void {
  const tmp = new THREE.Color();
  for (let i = 0; i < moves.length; i++) {
    mesh.setColorAt(i, resolveMoveColor(moves[i], i, mode, fallback, ctx, tmp));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function computeLayerCounts(layers: Layer[], moves: Move[]): LayerCount[] {
  const counts: LayerCount[] = [];
  let extrusion = 0;
  let travel = 0;
  for (const layer of layers) {
    for (let i = layer.startMove; i < layer.endMove; i++) {
      if (moves[i].extruding) extrusion++;
      else travel++;
    }
    counts.push({ extrusion, travel });
  }
  return counts;
}

/** Cumulative extrusion/travel counts through each move index, for point-level scrubbing. */
function computeMovePrefixCounts(moves: Move[]): { extrusion: Uint32Array; travel: Uint32Array } {
  const extrusion = new Uint32Array(moves.length + 1);
  const travel = new Uint32Array(moves.length + 1);
  for (let i = 0; i < moves.length; i++) {
    extrusion[i + 1] = extrusion[i] + (moves[i].extruding ? 1 : 0);
    travel[i + 1] = travel[i] + (moves[i].extruding ? 0 : 1);
  }
  return { extrusion, travel };
}

function buildPointMarker(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(1, 16, 12);
  const material = new THREE.MeshBasicMaterial({ color: POINT_MARKER_COLOR });
  const marker = new THREE.Mesh(geometry, material);
  marker.visible = false;
  marker.frustumCulled = false;
  return marker;
}

/** Builds toolpath geometry once; layer/point scrubbing after this is just a drawRange/count update. */
export function buildToolpath(moves: Move[], layers: Layer[]): Toolpath {
  const extrudeMoves: Move[] = [];
  const travelMoves: Move[] = [];
  const extrudeLayerIndex: number[] = [];
  const travelLayerIndex: number[] = [];
  let minFeedrate = Infinity;
  let maxFeedrate = -Infinity;

  let layerCursor = 0;
  for (let i = 0; i < moves.length; i++) {
    while (layerCursor < layers.length - 1 && i >= layers[layerCursor].endMove) layerCursor++;
    const move = moves[i];
    if (move.extruding) {
      extrudeMoves.push(move);
      extrudeLayerIndex.push(layerCursor);
    } else {
      travelMoves.push(move);
      travelLayerIndex.push(layerCursor);
    }
    if (move.feedrate > 0) {
      minFeedrate = Math.min(minFeedrate, move.feedrate);
      maxFeedrate = Math.max(maxFeedrate, move.feedrate);
    }
  }
  if (!Number.isFinite(minFeedrate)) {
    minFeedrate = 0;
    maxFeedrate = 0;
  }

  const extrudeCtx: ColorContext = { minFeedrate, maxFeedrate, totalLayers: layers.length, layerIndexFor: extrudeLayerIndex };
  const travelCtx: ColorContext = { minFeedrate, maxFeedrate, totalLayers: layers.length, layerIndexFor: travelLayerIndex };

  const extrusionGeometry = buildLineGeometry(extrudeMoves);
  const travelGeometry = buildLineGeometry(travelMoves);
  applyLineColors(extrusionGeometry, extrudeMoves, 'move-type', EXTRUSION_COLOR, extrudeCtx);
  applyLineColors(travelGeometry, travelMoves, 'move-type', TRAVEL_COLOR, travelCtx);

  const extrusionLinesMaterial = new THREE.LineBasicMaterial({ vertexColors: true });
  const travelMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35 });

  const extrusionLines = new THREE.LineSegments(extrusionGeometry, extrusionLinesMaterial);
  const travelLines = new THREE.LineSegments(travelGeometry, travelMaterial);
  extrusionLines.frustumCulled = false;
  travelLines.frustumCulled = false;

  let extrusionWidth = DEFAULT_EXTRUSION_WIDTH;
  let layerHeight = DEFAULT_LAYER_HEIGHT;
  const extrusionTubes = buildTubeMesh(extrudeMoves, extrusionWidth / 2, layerHeight / 2);
  applyTubeColors(extrusionTubes, extrudeMoves, 'move-type', EXTRUSION_COLOR, extrudeCtx);
  extrusionTubes.frustumCulled = false;
  extrusionTubes.visible = false;

  const pointMarker = buildPointMarker();

  const group = new THREE.Group();
  group.add(extrusionLines, extrusionTubes, travelLines, pointMarker);

  const layerCounts = computeLayerCounts(layers, moves);
  const movePrefix = computeMovePrefixCounts(moves);

  function applyCounts(extrusionCount: number, travelCount: number): void {
    extrusionGeometry.setDrawRange(0, extrusionCount * 2);
    travelGeometry.setDrawRange(0, travelCount * 2);
    extrusionTubes.count = extrusionCount;
  }

  function setVisibleThroughLayer(layerIndex: number): void {
    const clamped = Math.max(0, Math.min(layerIndex, layerCounts.length - 1));
    const counts = layerCounts[clamped] ?? { extrusion: 0, travel: 0 };
    applyCounts(counts.extrusion, counts.travel);
  }

  function setVisibleThroughMove(moveIndex: number): void {
    const clamped = Math.max(-1, Math.min(moveIndex, moves.length - 1));
    applyCounts(movePrefix.extrusion[clamped + 1], movePrefix.travel[clamped + 1]);

    if (clamped >= 0) {
      const m = moves[clamped];
      const scenePos = new THREE.Vector3();
      toSceneVec(m.x1, m.y1, m.z1, scenePos);
      pointMarker.position.copy(scenePos);
    }
  }

  function setShowTravel(show: boolean): void {
    travelLines.visible = show;
  }

  function setColorMode(mode: ColorMode): void {
    applyLineColors(extrusionGeometry, extrudeMoves, mode, EXTRUSION_COLOR, extrudeCtx);
    applyLineColors(travelGeometry, travelMoves, mode, TRAVEL_COLOR, travelCtx);
    applyTubeColors(extrusionTubes, extrudeMoves, mode, EXTRUSION_COLOR, extrudeCtx);
  }

  function setRenderMode(mode: RenderMode): void {
    extrusionLines.visible = mode === 'lines';
    extrusionTubes.visible = mode === 'tubes';
  }

  function setExtrusionWidth(width: number): void {
    extrusionWidth = Math.max(MIN_EXTRUSION_WIDTH, Math.min(width, MAX_EXTRUSION_WIDTH));
    updateTubeTransforms(extrusionTubes, extrudeMoves, extrusionWidth / 2, layerHeight / 2);
  }

  function setLayerHeight(height: number): void {
    layerHeight = Math.max(MIN_LAYER_HEIGHT, Math.min(height, MAX_LAYER_HEIGHT));
    updateTubeTransforms(extrusionTubes, extrudeMoves, extrusionWidth / 2, layerHeight / 2);
    pointMarker.scale.setScalar(layerHeight);
  }

  function setPointMarkerVisible(visible: boolean): void {
    pointMarker.visible = visible;
  }

  function dispose(): void {
    extrusionGeometry.dispose();
    travelGeometry.dispose();
    extrusionLinesMaterial.dispose();
    travelMaterial.dispose();
    extrusionTubes.geometry.dispose();
    (extrusionTubes.material as THREE.Material).dispose();
    pointMarker.geometry.dispose();
    (pointMarker.material as THREE.Material).dispose();
  }

  setVisibleThroughLayer(layers.length - 1);
  pointMarker.scale.setScalar(layerHeight);

  return {
    object: group,
    totalMoves: moves.length,
    layerCount: layers.length,
    setVisibleThroughLayer,
    setVisibleThroughMove,
    setShowTravel,
    setColorMode,
    setRenderMode,
    setExtrusionWidth,
    setLayerHeight,
    setPointMarkerVisible,
    dispose,
  };
}
