import * as THREE from 'three';
import type { Vec3 } from '../parser';
import { disposeObjectTree, makeLabelSprite, setLabelHeight } from './labels';

/**
 * Point-to-point measurement over the toolpath.
 *
 * Picking snaps to toolpath vertices rather than raycasting the tube meshes:
 * vertices are the numbers actually in the file, so a measurement reports the
 * programmed coordinates instead of a point somewhere on a rendered bead. The
 * search is a screen-space nearest-point scan over the packed vertex array —
 * one pass per click, no acceleration structure to keep in sync with layer
 * scrubbing.
 */

export interface MeasureResult {
  a: Vec3;
  b: Vec3;
  /** Component deltas, B - A, in G-code mm. */
  dx: number;
  dy: number;
  dz: number;
  /** Distance ignoring Z — the useful one for "how far apart in plan". */
  distanceXY: number;
  distance: number;
}

export interface MeasureState {
  enabled: boolean;
  /** First picked point, if any. */
  from: Vec3 | null;
  result: MeasureResult | null;
}

export interface MeasureTool {
  object: THREE.Object3D;
  setEnabled(enabled: boolean): void;
  /** Snap targets: G-code-space xyz triples, in file order (see analysis/pack). */
  setVertices(vertices: Float32Array): void;
  /** Restricts snapping to the part of the toolpath the scrubber is showing. */
  setVisibleVertexCount(count: number): void;
  /** Model size in mm, used to scale markers and labels. */
  setSceneSize(size: number): void;
  /**
   * Picks the toolpath vertex nearest to a canvas-relative pixel position.
   * Returns false when nothing was within the snap radius.
   */
  pick(pixelX: number, pixelY: number, width: number, height: number): boolean;
  clear(): void;
  getState(): MeasureState;
  dispose(): void;
}

/** How close (in CSS pixels) the cursor has to be to a vertex to snap to it. */
const SNAP_RADIUS_PX = 22;

const AXIS_COLORS = {
  x: new THREE.Color(0xff5555),
  y: new THREE.Color(0x55dd55),
  z: new THREE.Color(0x5599ff),
};

function toScene(point: Vec3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(point.x, point.z, -point.y);
}

function measure(a: Vec3, b: Vec3): MeasureResult {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return {
    a,
    b,
    dx,
    dy,
    dz,
    distanceXY: Math.hypot(dx, dy),
    distance: Math.hypot(dx, dy, dz),
  };
}

export function createMeasureTool(
  camera: THREE.PerspectiveCamera,
  onChange: (state: MeasureState) => void,
): MeasureTool {
  const group = new THREE.Group();
  group.visible = false;

  const markerGeometry = new THREE.SphereGeometry(1, 12, 8);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
  const markerA = new THREE.Mesh(markerGeometry, markerMaterial);
  const markerB = new THREE.Mesh(markerGeometry, markerMaterial);
  markerA.renderOrder = 6;
  markerB.renderOrder = 6;
  markerA.visible = false;
  markerB.visible = false;
  group.add(markerA, markerB);

  // Straight A->B line.
  const directGeometry = new THREE.BufferGeometry();
  directGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const directLine = new THREE.LineSegments(
    directGeometry,
    new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
  );
  directLine.renderOrder = 6;
  directLine.visible = false;
  group.add(directLine);

  // Staircase of the three component deltas, colored per axis: the XY/Z
  // breakdown is what you want when checking clearances and layer heights.
  const axisGeometry = new THREE.BufferGeometry();
  axisGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
  axisGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(18), 3));
  const axisLines = new THREE.LineSegments(
    axisGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 }),
  );
  axisLines.renderOrder = 6;
  axisLines.visible = false;
  group.add(axisLines);

  let label: THREE.Sprite | null = null;
  let vertices: Float32Array = new Float32Array(0);
  let visibleVertexCount = 0;
  let sceneSize = 100;
  let enabled = false;
  let from: Vec3 | null = null;
  let fromIndex = -1;
  let result: MeasureResult | null = null;

  const viewProjection = new THREE.Matrix4();
  const scenePoint = new THREE.Vector3();

  function state(): MeasureState {
    return { enabled, from, result };
  }

  function markerRadius(): number {
    return Math.max(sceneSize * 0.005, 0.15);
  }

  function clearLabel(): void {
    if (!label) return;
    group.remove(label);
    label.material.map?.dispose();
    label.material.dispose();
    label = null;
  }

  function refresh(): void {
    const radius = markerRadius();
    markerA.scale.setScalar(radius);
    markerB.scale.setScalar(radius);

    markerA.visible = from !== null;
    if (from) toScene(from, markerA.position);

    markerB.visible = result !== null;
    directLine.visible = result !== null;
    axisLines.visible = result !== null;
    clearLabel();

    if (!result) {
      onChange(state());
      return;
    }

    const a = result.a;
    const b = result.b;
    toScene(b, markerB.position);

    const direct = directGeometry.getAttribute('position') as THREE.BufferAttribute;
    toScene(a, scenePoint);
    direct.setXYZ(0, scenePoint.x, scenePoint.y, scenePoint.z);
    toScene(b, scenePoint);
    direct.setXYZ(1, scenePoint.x, scenePoint.y, scenePoint.z);
    direct.needsUpdate = true;

    // A -> (bx, ay, az) -> (bx, by, az) -> B, one segment per axis.
    const corners: Vec3[] = [
      a,
      { x: b.x, y: a.y, z: a.z },
      { x: b.x, y: b.y, z: a.z },
      b,
    ];
    const axisPosition = axisGeometry.getAttribute('position') as THREE.BufferAttribute;
    const axisColor = axisGeometry.getAttribute('color') as THREE.BufferAttribute;
    const colors = [AXIS_COLORS.x, AXIS_COLORS.y, AXIS_COLORS.z];
    for (let segment = 0; segment < 3; segment++) {
      const color = colors[segment];
      for (let end = 0; end < 2; end++) {
        const vertex = segment * 2 + end;
        toScene(corners[segment + end], scenePoint);
        axisPosition.setXYZ(vertex, scenePoint.x, scenePoint.y, scenePoint.z);
        axisColor.setXYZ(vertex, color.r, color.g, color.b);
      }
    }
    axisPosition.needsUpdate = true;
    axisColor.needsUpdate = true;

    label = makeLabelSprite(`${result.distance.toFixed(2)} mm`, '#ffffff');
    setLabelHeight(label, Math.max(sceneSize * 0.045, 1));
    label.position.set((a.x + b.x) / 2, (a.z + b.z) / 2, -(a.y + b.y) / 2);
    group.add(label);

    onChange(state());
  }

  function pick(pixelX: number, pixelY: number, width: number, height: number): boolean {
    if (!enabled || visibleVertexCount === 0 || width === 0 || height === 0) return false;

    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = viewProjection.elements;

    let bestIndex = -1;
    let bestScreenDistance = SNAP_RADIUS_PX * SNAP_RADIUS_PX;
    let bestDepth = Infinity;

    for (let i = 0; i < visibleVertexCount; i++) {
      const gx = vertices[i * 3];
      const gy = vertices[i * 3 + 1];
      const gz = vertices[i * 3 + 2];
      // Inlined scene mapping + projection: this runs over every visible
      // vertex, so it stays allocation-free.
      const x = gx;
      const y = gz;
      const z = -gy;

      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (w <= 0) continue; // behind the camera
      const ndcX = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w;
      const ndcY = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
      if (ndcX < -1.2 || ndcX > 1.2 || ndcY < -1.2 || ndcY > 1.2) continue;

      const screenX = (ndcX + 1) * 0.5 * width;
      const screenY = (1 - ndcY) * 0.5 * height;
      const dx = screenX - pixelX;
      const dy = screenY - pixelY;
      const screenDistance = dx * dx + dy * dy;

      // Nearest to the cursor wins; ties (overlapping vertices in a stack of
      // layers) go to whichever is closest to the camera.
      if (screenDistance < bestScreenDistance || (screenDistance === bestScreenDistance && w < bestDepth)) {
        bestScreenDistance = screenDistance;
        bestDepth = w;
        bestIndex = i;
      }
    }

    if (bestIndex < 0) return false;
    // Re-picking the start point (a stray double click) would report a 0mm
    // measurement; treat it as a miss instead.
    if (result === null && bestIndex === fromIndex) return false;

    const picked: Vec3 = {
      x: vertices[bestIndex * 3],
      y: vertices[bestIndex * 3 + 1],
      z: vertices[bestIndex * 3 + 2],
    };

    if (from === null || result !== null) {
      // Starting a fresh measurement (first pick, or a third click after a
      // completed one).
      from = picked;
      fromIndex = bestIndex;
      result = null;
    } else {
      result = measure(from, picked);
    }
    refresh();
    return true;
  }

  function clear(): void {
    from = null;
    fromIndex = -1;
    result = null;
    refresh();
  }

  return {
    object: group,
    setEnabled(next: boolean): void {
      enabled = next;
      group.visible = next;
      if (!next) clear();
      else onChange(state());
    },
    setVertices(next: Float32Array): void {
      vertices = next;
      visibleVertexCount = next.length / 3;
      clear();
    },
    setVisibleVertexCount(count: number): void {
      visibleVertexCount = Math.max(0, Math.min(count, vertices.length / 3));
    },
    setSceneSize(size: number): void {
      sceneSize = Math.max(size, 1);
      refresh();
    },
    pick,
    clear,
    getState: state,
    dispose(): void {
      clearLabel();
      disposeObjectTree(group);
    },
  };
}
