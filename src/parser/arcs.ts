import type { Vec3 } from './types';

export interface ArcParams {
  start: Vec3;
  end: Vec3;
  /** Offset from start to arc center, X (already unit-scaled). */
  i: number;
  /** Offset from start to arc center, Y (already unit-scaled). */
  j: number;
  /** G2 = true (clockwise), G3 = false (counter-clockwise). */
  clockwise: boolean;
}

const MAX_SEGMENT_ANGLE = Math.PI / 18; // 10 degrees per segment
const MIN_SEGMENTS = 1;

/**
 * Subdivides a G2/G3 I/J-form arc into a polyline. Reference approach: same
 * center-point + angle-sweep method used by gcode-preview's arc handling
 * (see src/parser/README.md).
 */
export function subdivideArc(arc: ArcParams): Vec3[] {
  const { start, end, i, j, clockwise } = arc;
  const centerX = start.x + i;
  const centerY = start.y + j;
  const radius = Math.hypot(start.x - centerX, start.y - centerY);

  if (!Number.isFinite(radius) || radius < 1e-6) {
    return [end];
  }

  const startAngle = Math.atan2(start.y - centerY, start.x - centerX);
  let endAngle = Math.atan2(end.y - centerY, end.x - centerX);

  if (clockwise) {
    if (endAngle >= startAngle) endAngle -= 2 * Math.PI;
  } else {
    if (endAngle <= startAngle) endAngle += 2 * Math.PI;
  }

  const sweep = Math.abs(endAngle - startAngle);
  const segments = Math.max(MIN_SEGMENTS, Math.ceil(sweep / MAX_SEGMENT_ANGLE));

  const points: Vec3[] = [];
  for (let s = 1; s <= segments; s++) {
    const t = s / segments;
    const angle = startAngle + (endAngle - startAngle) * t;
    points.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      z: start.z + (end.z - start.z) * t,
    });
  }
  return points;
}
