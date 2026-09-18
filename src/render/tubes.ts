import * as THREE from 'three';
import type { Move } from '../parser';

/**
 * Instanced capsule ("round-capped tube") rendering for extrusion moves.
 *
 * Each move is one instance. Capsules — rather than the open-ended cylinders
 * this used to draw — solve two artefacts at once:
 *
 * - **Hollow ends.** An open cylinder is a wall with no lid, so you could see
 *   straight down the bore at the start/end of every path.
 * - **Broken corners.** Consecutive segments meet at an angle, leaving a
 *   wedge-shaped gap between two flat-ended cylinders. A cap of the same
 *   cross-section fills that wedge, which is the standard "round join" — and
 *   it matches how a nozzle actually lays material down.
 *
 * The cross-section is an ellipse, not a circle: a bead is as wide as the
 * nozzle and as tall as the layer height, which for 3DCP means something like
 * 30mm x 10mm. So the instance matrix carries an oriented basis (width axis
 * horizontal, height axis vertical) and the caps are half-ellipsoids.
 *
 * Scaling a capsule through the instance matrix would squash the caps along
 * the segment, so the matrix carries rotation + translation only and a vertex
 * shader rebuilds the real geometry from a unit template plus a per-instance
 * (width radius, height radius, half-length) attribute.
 */

export interface TubeMesh {
  mesh: THREE.InstancedMesh;
  /** Cheap: rewrites two floats per instance, no matrix recomposition. */
  setBeadSize(widthRadius: number, heightRadius: number): void;
  dispose(): void;
}

interface TubeQuality {
  radialSegments: number;
  capSegments: number;
}

/**
 * Round caps cost triangles, so roundness is traded away as the segment count
 * climbs — past ~100k segments a bead is only a few pixels across and the
 * facets are invisible. At the coarsest tier the caps degenerate to a single
 * cone band, which still closes the tube and still fills corner joints.
 */
function qualityFor(instanceCount: number): TubeQuality {
  if (instanceCount <= 30_000) return { radialSegments: 10, capSegments: 3 };
  if (instanceCount <= 100_000) return { radialSegments: 8, capSegments: 2 };
  if (instanceCount <= 250_000) return { radialSegments: 6, capSegments: 2 };
  return { radialSegments: 5, capSegments: 1 };
}

/**
 * Unit template: radius 1 with a cylindrical section of length 1, so wall
 * vertices sit exactly at y = ±0.5 and cap vertices beyond them. The shader
 * relies on that split, so this geometry must not be pre-scaled.
 */
function createTemplateGeometry(quality: TubeQuality): THREE.BufferGeometry {
  const geometry = new THREE.CapsuleGeometry(1, 1, quality.capSegments, quality.radialSegments);
  // Per-instance colors only reach the fragment shader when the material has
  // vertexColors on (Three.js multiplies instanceColor into the geometry's
  // own `color` attribute), so the template needs an all-white one. Without
  // this the tubes render black regardless of the selected color mode.
  const vertexCount = geometry.getAttribute('position').count;
  const white = new Float32Array(vertexCount * 3).fill(1);
  geometry.setAttribute('color', new THREE.BufferAttribute(white, 3));
  return geometry;
}

const TUBE_VERTEX_DECLARATIONS = /* glsl */ `
attribute vec3 aTube; // x = width radius, y = height radius, z = half the segment length
`;

/**
 * Local x is the bead's width axis, z its height axis, y the segment. The
 * caps are half-ellipsoids with semi-axes (width, width, height): a turn
 * happens in the horizontal plane, so the cap has to reach a full width
 * radius past the segment end to meet the next segment's flank, while its
 * vertical profile stays the bead height.
 *
 * capSign picks which cap a vertex belongs to; wall vertices sit exactly on
 * the +/-0.5 boundary and land on the cylinder ends either way.
 */
const TUBE_VERTEX_TRANSFORM = /* glsl */ `
float capSign = position.y >= 0.0 ? 1.0 : -1.0;
vec3 transformed = vec3(
  position.x * aTube.x,
  (position.y - capSign * 0.5) * aTube.x + capSign * aTube.z,
  position.z * aTube.y
);
`;

// A non-uniform scale needs the inverse transpose on normals, or the lighting
// reads as a round bead however flat the cross-section actually is.
const TUBE_NORMAL_TRANSFORM = /* glsl */ `
vec3 objectNormal = normalize(vec3(
  normal.x / max(aTube.x, 1e-6),
  normal.y / max(aTube.x, 1e-6),
  normal.z / max(aTube.y, 1e-6)
));
`;

function createTubeMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.6,
    metalness: 0.05,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${TUBE_VERTEX_DECLARATIONS}`)
      .replace('#include <beginnormal_vertex>', TUBE_NORMAL_TRANSFORM)
      .replace('#include <begin_vertex>', TUBE_VERTEX_TRANSFORM);
  };
  // Without a distinct cache key Three.js could hand this material a program
  // compiled for a plain MeshStandardMaterial with the same parameters.
  material.customProgramCacheKey = () => 'gcode-capsule-tube-v2';
  return material;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_X = new THREE.Vector3(1, 0, 0);

/**
 * Picks a stable perpendicular basis for a move direction: `right` is
 * horizontal (perpendicular to both the direction and world-up — the bead's
 * "width" axis), `up` is whatever's left (the "height" axis, close to
 * vertical except for near-vertical moves like Z-hops).
 */
function computeCrossSectionBasis(direction: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
  right.crossVectors(direction, WORLD_UP);
  if (right.lengthSq() < 1e-8) right.crossVectors(direction, WORLD_X); // direction ~parallel to world-up
  right.normalize();
  up.crossVectors(right, direction).normalize();
}

/** Builds one capsule instance per move. Radii are half the bead width/height, in mm. */
export function createTubeMesh(moves: Move[], widthRadius: number, heightRadius: number): TubeMesh {
  const geometry = createTemplateGeometry(qualityFor(moves.length));
  const material = createTubeMaterial();
  const instanceCount = Math.max(1, moves.length);
  const mesh = new THREE.InstancedMesh(geometry, material, instanceCount);
  mesh.count = moves.length;

  // Half-length is fixed per move; the radii change when the user drags the
  // bead-width or layer-height sliders.
  const tubeData = new Float32Array(instanceCount * 3);
  const tubeAttribute = new THREE.InstancedBufferAttribute(tubeData, 3);
  tubeAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aTube', tubeAttribute);

  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const unitScale = new THREE.Vector3(1, 1, 1);
  const matrix = new THREE.Matrix4();

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    // G-code Z-up -> Three.js Y-up: (x, y, z) -> (x, z, -y). Same mapping as
    // toolpath.ts uses for the line geometry.
    start.set(m.x0, m.z0, -m.y0);
    end.set(m.x1, m.z1, -m.y1);
    direction.subVectors(end, start);
    const length = direction.length();
    midpoint.addVectors(start, end).multiplyScalar(0.5);

    if (length < 1e-6) {
      // Zero-length move (a bare retract/prime, for instance) — nothing to draw.
      quaternion.identity();
      tubeData[i * 3] = 0;
      tubeData[i * 3 + 1] = 0;
      tubeData[i * 3 + 2] = 0;
    } else {
      direction.divideScalar(length);
      computeCrossSectionBasis(direction, right, up);
      // Template's local axes: X is the width axis, Z the height axis, Y the length.
      basis.makeBasis(right, direction, up);
      quaternion.setFromRotationMatrix(basis);
      tubeData[i * 3] = widthRadius;
      tubeData[i * 3 + 1] = heightRadius;
      tubeData[i * 3 + 2] = length / 2;
    }

    matrix.compose(midpoint, quaternion, unitScale);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  tubeAttribute.needsUpdate = true;

  function setBeadSize(nextWidth: number, nextHeight: number): void {
    for (let i = 0; i < moves.length; i++) {
      // Leave degenerate moves collapsed.
      if (tubeData[i * 3 + 2] > 0) {
        tubeData[i * 3] = nextWidth;
        tubeData[i * 3 + 1] = nextHeight;
      }
    }
    tubeAttribute.needsUpdate = true;
  }

  function dispose(): void {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, setBeadSize, dispose };
}
