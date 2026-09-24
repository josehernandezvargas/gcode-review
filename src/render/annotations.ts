import * as THREE from 'three';
import type { Bounds } from '../parser';
import type { Issue, IssueGroup, IssueKind } from '../analysis';
import { disposeObjectTree, makeLabelSprite, setLabelHeight } from './labels';

/**
 * Scene overlays that annotate the loaded file rather than draw it: the
 * print's bounding box with its dimensions, and markers for issues the
 * analysis pass found.
 */

export interface Annotation {
  object: THREE.Object3D;
  dispose(): void;
}

const BOX_COLOR = 0x66d9a0;
const ISSUE_COLORS: Record<IssueKind, number> = {
  'out-of-volume': 0xff3b30,
  'below-plate': 0xff9500,
  'travel-collision': 0xff00aa,
};

/** G-code (x, y, z) -> Three.js (x, z, -y), matching toolpath.ts. */
function toScene(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x, z, -y);
}

/**
 * Wireframe box around the print's own bounds, with an X/Y/Z dimension label
 * on three edges and a footprint outline dropped onto the plate.
 */
export function createBoundingBoxHelper(bounds: Bounds): Annotation {
  const group = new THREE.Group();
  const size = {
    x: Math.max(bounds.max.x - bounds.min.x, 0),
    y: Math.max(bounds.max.y - bounds.min.y, 0),
    z: Math.max(bounds.max.z - bounds.min.z, 0),
  };
  const largest = Math.max(size.x, size.y, size.z, 1);

  const boxGeometry = new THREE.BoxGeometry(Math.max(size.x, 1e-3), Math.max(size.z, 1e-3), Math.max(size.y, 1e-3));
  const edges = new THREE.EdgesGeometry(boxGeometry);
  boxGeometry.dispose();
  const box = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: BOX_COLOR, transparent: true, opacity: 0.8 }),
  );
  box.position.set(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.z + bounds.max.z) / 2,
    -(bounds.min.y + bounds.max.y) / 2,
  );
  group.add(box);

  // Footprint: the same rectangle projected onto the plate, so you can read
  // off where the print sits even when the camera is level with it.
  const footprint = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      toScene(bounds.min.x, bounds.min.y, 0),
      toScene(bounds.max.x, bounds.min.y, 0),
      toScene(bounds.max.x, bounds.max.y, 0),
      toScene(bounds.min.x, bounds.max.y, 0),
    ]),
    new THREE.LineBasicMaterial({ color: BOX_COLOR, transparent: true, opacity: 0.35 }),
  );
  group.add(footprint);

  const labelHeight = largest * 0.06;
  const offset = largest * 0.04;

  const xLabel = makeLabelSprite(`X ${size.x.toFixed(1)} mm`, '#8ce8c0');
  xLabel.position.copy(toScene((bounds.min.x + bounds.max.x) / 2, bounds.min.y, bounds.min.z));
  xLabel.position.z += offset;

  const yLabel = makeLabelSprite(`Y ${size.y.toFixed(1)} mm`, '#8ce8c0');
  yLabel.position.copy(toScene(bounds.max.x, (bounds.min.y + bounds.max.y) / 2, bounds.min.z));
  yLabel.position.x += offset;

  const zLabel = makeLabelSprite(`Z ${size.z.toFixed(1)} mm`, '#8ce8c0');
  zLabel.position.copy(toScene(bounds.max.x, bounds.min.y, (bounds.min.z + bounds.max.z) / 2));
  zLabel.position.x += offset;
  zLabel.position.z += offset;

  for (const label of [xLabel, yLabel, zLabel]) {
    setLabelHeight(label, labelHeight);
    group.add(label);
  }

  return {
    object: group,
    dispose: () => disposeObjectTree(group),
  };
}

/**
 * One always-on-top sphere per reported issue, colored by kind. Groups carry
 * a bounded sample of their issues, so this stays small no matter how many
 * were counted.
 */
export function createIssueMarkers(groups: IssueGroup[], sceneSize: number): Annotation {
  const group = new THREE.Group();
  const radius = Math.max(sceneSize * 0.006, 0.3);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(radius, radius, radius);

  for (const issueGroup of groups) {
    if (issueGroup.issues.length === 0) continue;
    const geometry = new THREE.SphereGeometry(1, 8, 6);
    const material = new THREE.MeshBasicMaterial({
      color: ISSUE_COLORS[issueGroup.kind],
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, issueGroup.issues.length);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    issueGroup.issues.forEach((issue: Issue, index: number) => {
      toScene(issue.point.x, issue.point.y, issue.point.z, position);
      mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  return {
    object: group,
    dispose: () => disposeObjectTree(group),
  };
}
