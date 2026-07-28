import type { PackedToolpath } from './pack';
import type {
  AnalysisOptions,
  AnalysisReport,
  AnalysisSummary,
  Issue,
  IssueGroup,
  IssueKind,
} from './types';

/**
 * Static collision / sanity checks over a parsed toolpath. Pure functions —
 * no DOM, no Three.js — so this runs unchanged in a Web Worker and in unit
 * tests.
 *
 * What it can see: the toolpath itself and an axis-aligned build volume.
 * What it cannot see: gantry/carriage shape, part cooling ducts, clips or
 * anything else physical the G-code doesn't describe. These checks are
 * advisory, not a substitute for watching the first layer print.
 */

const DEFAULT_ENDPOINT_TOLERANCE_MM = 0.4;
const DEFAULT_MAX_ISSUES_PER_GROUP = 200;
/** XY bucket size for the same-layer segment index, in mm. */
const GRID_CELL_MM = 4;
/** Guards the DDA walk against absurd coordinates in a malformed file. */
const MAX_CELLS_PER_WALK = 4096;
/** Total segment-pair tests before the collision scan gives up and reports truncation. */
const PAIR_TEST_BUDGET = 20_000_000;
const Z_EPSILON = 1e-4;
const PLATE_EPSILON = 1e-3;

/** Cell key packing: exact in a double for cell coordinates within +/-2^20. */
const CELL_OFFSET = 1 << 20;
const CELL_STRIDE = 1 << 21;

function cellKey(cx: number, cy: number): number {
  return (cx + CELL_OFFSET) * CELL_STRIDE + (cy + CELL_OFFSET);
}

/**
 * Visits every grid cell a 2D segment passes through (Amanatides–Woo). The
 * visitor returns false to stop the walk early.
 */
function walkCells(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cell: number,
  visit: (cx: number, cy: number) => boolean,
): void {
  let cx = Math.floor(x0 / cell);
  let cy = Math.floor(y0 / cell);
  const endX = Math.floor(x1 / cell);
  const endY = Math.floor(y1 / cell);

  const dx = x1 - x0;
  const dy = y1 - y0;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? cell / Math.abs(dx) : Infinity;
  const tDeltaY = stepY !== 0 ? cell / Math.abs(dy) : Infinity;
  let tMaxX = stepX > 0 ? ((cx + 1) * cell - x0) / dx : stepX < 0 ? (cx * cell - x0) / dx : Infinity;
  let tMaxY = stepY > 0 ? ((cy + 1) * cell - y0) / dy : stepY < 0 ? (cy * cell - y0) / dy : Infinity;

  for (let i = 0; i < MAX_CELLS_PER_WALK; i++) {
    if (!visit(cx, cy)) return;
    if (cx === endX && cy === endY) return;
    if (tMaxX < tMaxY) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      cy += stepY;
      tMaxY += tDeltaY;
    }
    if (tMaxX > 1 && tMaxY > 1 && (cx !== endX || cy !== endY)) {
      // Past the far end without landing on the end cell: floating-point
      // drift, not a real cell. Visit the end cell and stop.
      visit(endX, endY);
      return;
    }
  }
}

interface Crossing {
  x: number;
  y: number;
}

/** Proper (non-parallel) segment intersection in XY, or null. */
function intersectSegments(
  ax0: number,
  ay0: number,
  ax1: number,
  ay1: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number,
): Crossing | null {
  const rx = ax1 - ax0;
  const ry = ay1 - ay0;
  const sx = bx1 - bx0;
  const sy = by1 - by0;
  const denom = rx * sy - ry * sx;
  // Collinear overlaps are not crossings in any useful sense here (a travel
  // running along a bead), so parallel pairs are skipped.
  if (Math.abs(denom) < 1e-12) return null;

  const qpx = bx0 - ax0;
  const qpy = by0 - ay0;
  const t = (qpx * sy - qpy * sx) / denom;
  if (t < 0 || t > 1) return null;
  const u = (qpx * ry - qpy * rx) / denom;
  if (u < 0 || u > 1) return null;

  return { x: ax0 + t * rx, y: ay0 + t * ry };
}

/** Collects at most `limit` issues of one kind while counting every occurrence. */
class IssueCollector {
  count = 0;
  readonly issues: Issue[] = [];

  constructor(
    readonly kind: IssueKind,
    readonly label: string,
    private readonly limit: number,
  ) {}

  add(issue: Issue): void {
    this.count++;
    if (this.issues.length < this.limit) this.issues.push(issue);
  }

  toGroup(): IssueGroup {
    return { kind: this.kind, label: this.label, count: this.count, issues: this.issues };
  }
}

function summarize(packed: PackedToolpath): AnalysisSummary {
  const { moveCount, positions, extruding, layerZ } = packed;
  let extrusionDistanceMm = 0;
  let travelDistanceMm = 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let sawExtrusion = false;

  for (let i = 0; i < moveCount; i++) {
    const o = i * 6;
    const x0 = positions[o];
    const y0 = positions[o + 1];
    const z0 = positions[o + 2];
    const x1 = positions[o + 3];
    const y1 = positions[o + 4];
    const z1 = positions[o + 5];
    const length = Math.hypot(x1 - x0, y1 - y0, z1 - z0);

    if (extruding[i]) {
      extrusionDistanceMm += length;
      sawExtrusion = true;
      minX = Math.min(minX, x0, x1);
      minY = Math.min(minY, y0, y1);
      minZ = Math.min(minZ, z0, z1);
      maxX = Math.max(maxX, x0, x1);
      maxY = Math.max(maxY, y0, y1);
      maxZ = Math.max(maxZ, z0, z1);
    } else {
      travelDistanceMm += length;
    }
  }

  return {
    moveCount,
    layerCount: layerZ.length,
    extrusionDistanceMm,
    travelDistanceMm,
    printBounds: sawExtrusion
      ? { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
      : null,
  };
}

/** Flags moves that leave the build volume, and any move dipping below the plate. */
function checkVolume(
  packed: PackedToolpath,
  options: Required<Pick<AnalysisOptions, 'maxIssuesPerGroup'>> & AnalysisOptions,
): IssueGroup[] {
  const { moveCount, positions, layerIndex } = packed;
  const volume = options.volume;
  const outside = new IssueCollector(
    'out-of-volume',
    volume ? `Outside ${volume.name} build volume` : 'Outside build volume',
    options.maxIssuesPerGroup,
  );
  const belowPlate = new IssueCollector('below-plate', 'Below the build plate (Z < 0)', options.maxIssuesPerGroup);

  let previousOutside = false;
  let previousBelow = false;

  for (let i = 0; i < moveCount; i++) {
    const o = i * 6;
    const x = positions[o + 3];
    const y = positions[o + 4];
    const z = positions[o + 5];

    const below = z < -PLATE_EPSILON || positions[o + 2] < -PLATE_EPSILON;
    if (below) {
      // Only the first move of a run gets a marker; the count covers them all.
      if (!previousBelow) {
        belowPlate.add({
          kind: 'below-plate',
          moveIndex: i,
          layerIndex: layerIndex[i],
          point: { x, y, z },
          message: `Z ${Math.min(z, positions[o + 2]).toFixed(2)} mm is below the plate`,
        });
      } else {
        belowPlate.count++;
      }
    }
    previousBelow = below;

    if (!volume) continue;
    const out =
      isOutside(positions[o], positions[o + 1], positions[o + 2], volume) ||
      isOutside(x, y, z, volume);
    if (out) {
      if (!previousOutside) {
        outside.add({
          kind: 'out-of-volume',
          moveIndex: i,
          layerIndex: layerIndex[i],
          point: { x, y, z },
          message: `Move leaves the ${volume.name} volume at X${x.toFixed(1)} Y${y.toFixed(1)} Z${z.toFixed(1)}`,
        });
      } else {
        outside.count++;
      }
    }
    previousOutside = out;
  }

  const groups = [outside.toGroup(), belowPlate.toGroup()];
  return groups.filter((group) => group.count > 0);
}

function isOutside(x: number, y: number, z: number, volume: NonNullable<AnalysisOptions['volume']>): boolean {
  return (
    x < volume.min.x - PLATE_EPSILON ||
    x > volume.max.x + PLATE_EPSILON ||
    y < volume.min.y - PLATE_EPSILON ||
    y > volume.max.y + PLATE_EPSILON ||
    z < volume.min.z - PLATE_EPSILON ||
    z > volume.max.z + PLATE_EPSILON
  );
}

/**
 * Nozzle-drag check: a travel that stays at (or below) the height of material
 * already deposited on the same layer and crosses one of those beads will
 * scrape it. Slicers avoid this with a Z-hop or by routing around perimeters;
 * a file full of these usually means both were switched off.
 */
function checkTravelCollisions(
  packed: PackedToolpath,
  options: Required<Pick<AnalysisOptions, 'endpointToleranceMm' | 'maxIssuesPerGroup'>>,
): { group: IssueGroup; truncated: boolean } {
  const { positions, extruding, layerStart, layerEnd, layerZ } = packed;
  const collector = new IssueCollector(
    'travel-collision',
    'Travel crosses printed material (no Z-hop)',
    options.maxIssuesPerGroup,
  );

  const grid = new Map<number, number[]>();
  // Dedupes candidates that span several cells; stores queryId + 1 per move.
  const lastSeen = new Int32Array(packed.moveCount);
  const tolerance = options.endpointToleranceMm;
  let budget = PAIR_TEST_BUDGET;
  let truncated = false;

  for (let layer = 0; layer < layerZ.length && !truncated; layer++) {
    grid.clear();
    let depositedTopZ = -Infinity;

    for (let i = layerStart[layer]; i < layerEnd[layer]; i++) {
      const o = i * 6;
      const x0 = positions[o];
      const y0 = positions[o + 1];
      const x1 = positions[o + 3];
      const y1 = positions[o + 4];
      if (x0 === x1 && y0 === y1) continue; // pure Z or zero-length move

      if (extruding[i]) {
        depositedTopZ = Math.max(depositedTopZ, positions[o + 2], positions[o + 5]);
        walkCells(x0, y0, x1, y1, GRID_CELL_MM, (cx, cy) => {
          const key = cellKey(cx, cy);
          const bucket = grid.get(key);
          if (bucket) bucket.push(i);
          else grid.set(key, [i]);
          return true;
        });
        continue;
      }

      const travelMinZ = Math.min(positions[o + 2], positions[o + 5]);
      // Clear of everything laid down so far on this layer — a Z-hop.
      if (travelMinZ > depositedTopZ + Z_EPSILON) continue;

      const queryId = i + 1;
      const travelMinX = Math.min(x0, x1);
      const travelMaxX = Math.max(x0, x1);
      const travelMinY = Math.min(y0, y1);
      const travelMaxY = Math.max(y0, y1);
      // A one-slot array rather than a `let`: the assignment happens inside a
      // callback, which control-flow narrowing doesn't follow.
      const hit: Crossing[] = [];

      walkCells(x0, y0, x1, y1, GRID_CELL_MM, (cx, cy) => {
        const bucket = grid.get(cellKey(cx, cy));
        if (!bucket) return true;
        for (const candidate of bucket) {
          if (lastSeen[candidate] === queryId) continue;
          lastSeen[candidate] = queryId;
          if (budget-- <= 0) {
            truncated = true;
            return false;
          }
          const c = candidate * 6;
          // The bead's top sits at the nozzle height that laid it; a travel
          // above that clears it.
          if (travelMinZ > Math.max(positions[c + 2], positions[c + 5]) + Z_EPSILON) continue;
          // Bounding-box reject before the intersection math. Most candidates
          // share a cell with the travel without going near it — infill lines
          // in particular — and this is several times cheaper than the full test.
          if (Math.min(positions[c], positions[c + 3]) > travelMaxX) continue;
          if (Math.max(positions[c], positions[c + 3]) < travelMinX) continue;
          if (Math.min(positions[c + 1], positions[c + 4]) > travelMaxY) continue;
          if (Math.max(positions[c + 1], positions[c + 4]) < travelMinY) continue;
          const crossing = intersectSegments(
            x0,
            y0,
            x1,
            y1,
            positions[c],
            positions[c + 1],
            positions[c + 3],
            positions[c + 4],
          );
          if (!crossing) continue;
          // A travel starts where the previous bead ended and ends where the
          // next one begins; those touches are not collisions.
          if (Math.hypot(crossing.x - x0, crossing.y - y0) <= tolerance) continue;
          if (Math.hypot(crossing.x - x1, crossing.y - y1) <= tolerance) continue;
          hit.push(crossing);
          return false;
        }
        return true;
      });

      if (hit.length > 0) {
        const crossing = hit[0];
        collector.add({
          kind: 'travel-collision',
          moveIndex: i,
          layerIndex: layer,
          point: { x: crossing.x, y: crossing.y, z: travelMinZ },
          message: `Layer ${layer + 1}: travel at Z${travelMinZ.toFixed(2)} crosses a bead at X${crossing.x.toFixed(1)} Y${crossing.y.toFixed(1)}`,
        });
      }
    }
  }

  return { group: collector.toGroup(), truncated };
}

/** Runs every check over a packed toolpath and returns one combined report. */
export function analyzeToolpath(packed: PackedToolpath, options: AnalysisOptions = {}): AnalysisReport {
  const startedAt = Date.now();
  const resolved = {
    ...options,
    endpointToleranceMm: options.endpointToleranceMm ?? DEFAULT_ENDPOINT_TOLERANCE_MM,
    maxIssuesPerGroup: options.maxIssuesPerGroup ?? DEFAULT_MAX_ISSUES_PER_GROUP,
  };

  const summary = summarize(packed);
  const groups = checkVolume(packed, resolved);
  const travel = checkTravelCollisions(packed, resolved);
  if (travel.group.count > 0) groups.push(travel.group);

  return {
    summary,
    groups,
    totalIssues: groups.reduce((total, group) => total + group.count, 0),
    truncated: travel.truncated,
    durationMs: Date.now() - startedAt,
    volumeName: options.volume?.name,
  };
}
