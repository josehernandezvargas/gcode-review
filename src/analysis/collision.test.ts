import { describe, expect, it } from 'vitest';
import type { Layer, Move } from '../parser';
import { analyzeToolpath } from './collision';
import { extractVertices, packToolpath } from './pack';

function move(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  extruding: boolean,
): Move {
  return { x0, y0, z0, x1, y1, z1, extruding, feedrate: 1200 };
}

function singleLayer(moves: Move[], z: number): Layer[] {
  return [{ index: 0, z, startMove: 0, endMove: moves.length }];
}

function pack(moves: Move[], z = 0.2) {
  return packToolpath(moves, singleLayer(moves, z));
}

function countOf(report: ReturnType<typeof analyzeToolpath>, kind: string): number {
  return report.groups.find((group) => group.kind === kind)?.count ?? 0;
}

describe('analyzeToolpath — travel collisions', () => {
  // Two beads printed on the same layer, then a travel back across the first
  // one at the same Z: the nozzle would drag through it.
  const crossingMoves = [
    move(0, 0, 0.2, 0, 10, 0.2, true),
    move(0, 10, 0.2, 10, 10, 0.2, false),
    move(10, 10, 0.2, 10, 0, 0.2, true),
    move(10, 0, 0.2, -5, 5, 0.2, false),
  ];

  it('flags a travel that crosses a printed bead at layer height', () => {
    const report = analyzeToolpath(pack(crossingMoves));
    const group = report.groups.find((g) => g.kind === 'travel-collision');

    expect(group?.count).toBe(1);
    expect(group?.issues[0].moveIndex).toBe(3);
    expect(group?.issues[0].point.x).toBeCloseTo(0, 5);
    expect(group?.issues[0].point.y).toBeCloseTo(10 / 3, 3);
  });

  it('ignores the same travel when it is Z-hopped clear of the layer', () => {
    const hopped = crossingMoves.map((m, i) =>
      i === 3 ? move(10, 0, 0.6, -5, 5, 0.6, false) : m,
    );
    expect(countOf(analyzeToolpath(pack(hopped)), 'travel-collision')).toBe(0);
  });

  it('does not flag a travel that merely starts where the last bead ended', () => {
    const moves = [
      move(0, 5, 0.2, 10, 5, 0.2, true),
      move(10, 5, 0.2, 15, 0, 0.2, false),
    ];
    expect(countOf(analyzeToolpath(pack(moves)), 'travel-collision')).toBe(0);
  });

  it('ignores beads printed on the same layer only after the travel', () => {
    // Same geometry as the crossing case, but the bead is laid down last —
    // nothing is in the nozzle's way at the time the travel happens.
    const moves = [
      move(10, 0, 0.2, -5, 5, 0.2, false),
      move(0, 0, 0.2, 0, 10, 0.2, true),
    ];
    expect(countOf(analyzeToolpath(pack(moves)), 'travel-collision')).toBe(0);
  });

  it('finds crossings far from the origin, where the grid keys go negative', () => {
    const moves = [
      move(-200, -200, 0.2, -200, -190, 0.2, true),
      move(-190, -195, 0.2, -210, -195, 0.2, false),
    ];
    expect(countOf(analyzeToolpath(pack(moves)), 'travel-collision')).toBe(1);
  });
});

describe('analyzeToolpath — build volume', () => {
  const volume = { name: 'Test 100', min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } };

  it('flags moves that leave the volume and reports the machine name', () => {
    const moves = [move(10, 10, 0.2, 150, 10, 0.2, true)];
    const report = analyzeToolpath(pack(moves), { volume });

    expect(countOf(report, 'out-of-volume')).toBe(1);
    expect(report.volumeName).toBe('Test 100');
    expect(report.groups[0].issues[0].message).toContain('Test 100');
  });

  it('reports nothing for a toolpath that fits', () => {
    const moves = [move(10, 10, 0.2, 90, 90, 0.2, true)];
    expect(analyzeToolpath(pack(moves), { volume }).totalIssues).toBe(0);
  });

  it('flags moves below the plate without needing a machine profile', () => {
    const moves = [move(10, 10, 0.2, 10, 20, -0.5, true)];
    expect(countOf(analyzeToolpath(pack(moves)), 'below-plate')).toBe(1);
  });
});

describe('analyzeToolpath — summary', () => {
  it('separates extrusion and travel distance and bounds the printed part only', () => {
    const moves = [
      move(0, 0, 0.2, 10, 0, 0.2, true), // 10mm extruded
      move(10, 0, 0.2, 10, 3, 0.2, false), // 3mm travel, out to a prime area
      move(10, 3, 0.2, 250, 3, 0.2, false), // long travel well outside the part
    ];
    const report = analyzeToolpath(pack(moves));

    expect(report.summary.extrusionDistanceMm).toBeCloseTo(10, 5);
    expect(report.summary.travelDistanceMm).toBeCloseTo(243, 5);
    expect(report.summary.printBounds?.max.x).toBeCloseTo(10, 5);
    expect(report.summary.moveCount).toBe(3);
  });

  it('handles an empty toolpath', () => {
    const report = analyzeToolpath(packToolpath([], []));
    expect(report.totalIssues).toBe(0);
    expect(report.summary.printBounds).toBeNull();
  });
});

describe('packToolpath', () => {
  it('assigns each move to its layer and exposes vertices for snapping', () => {
    const moves = [
      move(0, 0, 0.2, 10, 0, 0.2, true),
      move(10, 0, 0.4, 10, 10, 0.4, true),
    ];
    const layers: Layer[] = [
      { index: 0, z: 0.2, startMove: 0, endMove: 1 },
      { index: 1, z: 0.4, startMove: 1, endMove: 2 },
    ];
    const packed = packToolpath(moves, layers);

    expect(Array.from(packed.layerIndex)).toEqual([0, 1]);
    // Packed as Float32, so compare with a tolerance.
    expect(packed.layerZ[0]).toBeCloseTo(0.2, 5);
    expect(packed.layerZ[1]).toBeCloseTo(0.4, 5);

    // One vertex per move start, plus the final endpoint.
    const vertices = extractVertices(packed);
    expect(vertices.length).toBe((moves.length + 1) * 3);
    expect(vertices[6]).toBeCloseTo(10, 5);
    expect(vertices[7]).toBeCloseTo(10, 5);
    expect(vertices[8]).toBeCloseTo(0.4, 5);
  });
});
