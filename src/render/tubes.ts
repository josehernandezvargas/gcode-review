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
 *   wedge-shaped gap between two flat-ended cylinders. A hemispherical cap of
 *   the same radius fills that wedge exactly, which is the standard "round
 *   join" — and it also matches how a round nozzle actually lays material
 *   down.
 *
 * Naively scaling a capsule per instance would squash the caps (the scale
 * along the segment is its length, but the caps must stay spherical), so the
 * instance matrix carries rotation + translation only and a vertex shader
 * rebuilds the real capsule from a unit template plus a per-instance
 * (radius, half-length) attribute. Normals survive that transform unchanged:
 * the caps get a uniform scale, and the wall's normals are purely radial.
 */

export interface TubeMesh {
  mesh: THREE.InstancedMesh;
  /** Cheap: rewrites one float per instance, no matrix recomposition. */
  setRadius(radius: number): void;
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
attribute vec2 aTube; // x = tube radius, y = half the segment length
`;

// Radius scales the template radially; the two hemispheres are then pushed
// apart to straddle the segment. capSign picks which hemisphere a vertex
// belongs to (wall vertices sit exactly on the ±0.5 boundary and land on the
// cylinder ends either way).
const TUBE_VERTEX_TRANSFORM = /* glsl */ `
float capSign = position.y >= 0.0 ? 1.0 : -1.0;
vec3 transformed = vec3(
  position.x * aTube.x,
  (position.y - capSign * 0.5) * aTube.x + capSign * aTube.y,
  position.z * aTube.x
);
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
      .replace('#include <begin_vertex>', TUBE_VERTEX_TRANSFORM);
  };
  // Without a distinct cache key Three.js could hand this material a program
  // compiled for a plain MeshStandardMaterial with the same parameters.
  material.customProgramCacheKey = () => 'gcode-capsule-tube-v1';
  return material;
}

const UP_AXIS = new THREE.Vector3(0, 1, 0);

/** Builds one capsule instance per move. `radius` is the tube radius in mm. */
export function createTubeMesh(moves: Move[], radius: number): TubeMesh {
  const geometry = createTemplateGeometry(qualityFor(moves.length));
  const material = createTubeMaterial();
  const instanceCount = Math.max(1, moves.length);
  const mesh = new THREE.InstancedMesh(geometry, material, instanceCount);
  mesh.count = moves.length;

  // x = radius, y = half-length. Half-length is fixed per move; only the
  // radius changes when the user drags the extrusion-width slider.
  const tubeData = new Float32Array(instanceCount * 2);
  const tubeAttribute = new THREE.InstancedBufferAttribute(tubeData, 2);
  tubeAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aTube', tubeAttribute);

  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
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
      tubeData[i * 2] = 0;
      tubeData[i * 2 + 1] = 0;
    } else {
      direction.divideScalar(length);
      quaternion.setFromUnitVectors(UP_AXIS, direction);
      tubeData[i * 2] = radius;
      tubeData[i * 2 + 1] = length / 2;
    }

    matrix.compose(midpoint, quaternion, unitScale);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  tubeAttribute.needsUpdate = true;

  function setRadius(next: number): void {
    for (let i = 0; i < moves.length; i++) {
      // Leave degenerate moves collapsed.
      if (tubeData[i * 2 + 1] > 0) tubeData[i * 2] = next;
    }
    tubeAttribute.needsUpdate = true;
  }

  function dispose(): void {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, setRadius, dispose };
}
