import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseGCode } from './parse';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('parseGCode', () => {
  it('parses Cura-style comments: layer markers, TIME, Filament used', () => {
    const result = parseGCode(loadFixture('cura_style.gcode'));

    expect(result.layers).toHaveLength(2);
    expect(result.layers[0].z).toBeCloseTo(0.2);
    expect(result.layers[1].z).toBeCloseTo(0.4);

    expect(result.metadata.printTimeSeconds).toBe(42);
    expect(result.metadata.filamentUsedMm).toBeCloseTo(32);
    expect(result.metadata.layerHeightMm).toBeCloseTo(0.2);
    expect(result.metadata.nozzleTempC).toBe(200);
    expect(result.metadata.bedTempC).toBe(60);
    expect(result.metadata.machineName).toBe('Ultimaker S5');

    const wallMove = result.moves.find((m) => m.feature === 'WALL-OUTER');
    expect(wallMove).toBeDefined();
  });

  it('parses PrusaSlicer-style comments, relative extrusion, and a G2 arc', () => {
    const result = parseGCode(loadFixture('prusaslicer_style.gcode'));

    expect(result.layers).toHaveLength(2);
    expect(result.metadata.printTimeSeconds).toBe(3723); // 1h2m3s
    expect(result.metadata.filamentUsedMm).toBeCloseTo(1234.56);
    expect(result.metadata.filamentUsedGrams).toBeCloseTo(12.34);
    expect(result.metadata.layerHeightMm).toBeCloseTo(0.2);
    expect(result.metadata.nozzleDiameterMm).toBeCloseTo(0.4);
    expect(result.metadata.filamentType).toBe('PETG');
    expect(result.metadata.nozzleTempC).toBe(230);
    expect(result.metadata.bedTempC).toBe(70);
    expect(result.metadata.machineName).toBe('MK3S');

    const perimeterMove = result.moves.find((m) => m.feature === 'Perimeter');
    expect(perimeterMove).toBeDefined();

    // The G2 arc should be subdivided into multiple short segments, all extruding.
    const arcSegmentCount = result.moves.filter(
      (m) => m.extruding && m.y0 !== m.y1 && m.x1 <= 10.001,
    ).length;
    expect(arcSegmentCount).toBeGreaterThan(1);

    const lastArcMove = result.moves.find((m) => m.extruding && Math.abs(m.y1 - 10) < 0.01);
    expect(lastArcMove).toBeDefined();
    expect(lastArcMove!.x1).toBeCloseTo(10, 1);
  });

  it('parses Ultimaker/custom-script colon-style comments (NOZZLE_DIAMETER, TARGET_MACHINE.NAME, split created-at)', () => {
    const result = parseGCode(loadFixture('ultimaker_style.gcode'));

    // 3, not 2: the pre-print setup move (G0 to Z20, before the first ;LAYER:
    // marker) forms its own leading "layer" — real files have this too.
    expect(result.layers).toHaveLength(3);
    expect(result.metadata.printTimeSeconds).toBe(481);
    expect(result.metadata.nozzleDiameterMm).toBeCloseTo(2.0);
    expect(result.metadata.machineName).toBe('Ultimaker 2+');
    expect(result.metadata.slicer).toBe('Python / GH');
    expect(result.metadata.createdAt).toBe('20260703 6:46:58 PM');
    expect(result.metadata.nozzleTempC).toBe(205);
    // ";MATERIAL:1" is a material index, not a name — must not become "Material: 1".
    expect(result.metadata.material).toBeUndefined();
  });

  it('parses large-scale 3DCP output (";Layer n" markers, path-distance E, no header)', () => {
    const result = parseGCode(loadFixture('e3d_large_scale.gcode'));

    expect(result.layers).toHaveLength(3);
    expect(result.layers[0].z).toBeCloseTo(8);
    expect(result.layers[2].z).toBeCloseTo(24);
    expect(result.detectedLayerHeightMm).toBeCloseTo(8);

    // Origin-centered coordinates: bounds must keep their negative side.
    expect(result.bounds.min.x).toBeCloseTo(-550);
    expect(result.bounds.max.x).toBeCloseTo(550);

    // First move reaches the start point with E still 0 -> travel; the rest deposit.
    expect(result.moves[0].extruding).toBe(false);
    // E is cumulative XY path distance, so extruded path length matches the E span per layer.
    expect(result.totalExtrusionDistanceMm).toBeCloseTo(2272 * 3, 0);

    // No header at all: nothing may be fabricated.
    expect(result.metadata.layerHeightMm).toBeUndefined();
    expect(result.metadata.printTimeSeconds).toBeUndefined();
    expect(result.metadata.machineName).toBeUndefined();
  });

  it('parses the custom large-scale header schema (Machine, Material, Build volume, Origin, Bead width)', () => {
    const result = parseGCode(loadFixture('large_scale_with_header.gcode'));

    expect(result.layers).toHaveLength(2);
    expect(result.metadata.slicer).toBe('Rhino_PyWorkshop generic_gcode.py');
    expect(result.metadata.createdAt).toBe('2026-06-05 14:02:11');
    expect(result.metadata.machineName).toBe('RISE E3D gantry');
    expect(result.metadata.material).toBe('Concrete');
    expect(result.metadata.layerHeightMm).toBeCloseTo(8);
    expect(result.metadata.nozzleDiameterMm).toBeCloseTo(40);
    expect(result.metadata.buildVolume).toEqual({ x: 1200, y: 600, z: 600 });
    expect(result.metadata.originMode).toBe('center');
  });

  it('does not mistake "Layer height"/"Layer count" header lines for layer changes', () => {
    const result = parseGCode(loadFixture('large_scale_with_header.gcode'));
    expect(result.layers).toHaveLength(2);
    expect(result.layers[0].z).toBeCloseTo(8);
  });

  it('falls back to Z-height layer detection when no layer comments are present', () => {
    const result = parseGCode(loadFixture('no_comments.gcode'));

    expect(result.layers).toHaveLength(2);
    expect(result.layers[0].z).toBeCloseTo(0.2);
    expect(result.layers[1].z).toBeCloseTo(0.4);
    expect(result.metadata.printTimeSeconds).toBeUndefined();
    expect(result.metadata.filamentUsedMm).toBeUndefined();
    expect(result.metadata.nozzleTempC).toBeUndefined();
    expect(result.metadata.bedTempC).toBeUndefined();
  });

  it('tracks extrusion vs travel moves correctly', () => {
    const result = parseGCode(loadFixture('no_comments.gcode'));

    const travelMoves = result.moves.filter((m) => !m.extruding);
    const extrudeMoves = result.moves.filter((m) => m.extruding);

    expect(travelMoves.length).toBeGreaterThan(0);
    expect(extrudeMoves.length).toBeGreaterThan(0);
  });

  it('computes bounds across all moves', () => {
    const result = parseGCode(loadFixture('no_comments.gcode'));

    expect(result.bounds.min.x).toBeCloseTo(0);
    expect(result.bounds.max.x).toBeCloseTo(10);
    expect(result.bounds.min.y).toBeCloseTo(0);
    expect(result.bounds.max.y).toBeCloseTo(10);
    expect(result.bounds.max.z).toBeCloseTo(0.4);
  });

  it('handles relative positioning (G91)', () => {
    const gcode = ['G90', 'G1 X0 Y0', 'G91', 'G1 X10 Y0 E1', 'G1 X0 Y10 E1', 'G90'].join('\n');

    const result = parseGCode(gcode);
    const last = result.moves[result.moves.length - 1];

    expect(last.x1).toBeCloseTo(10);
    expect(last.y1).toBeCloseTo(10);
  });

  it('does not crash on an empty file', () => {
    const result = parseGCode('');
    expect(result.moves).toHaveLength(0);
    expect(result.layers).toHaveLength(0);
    expect(result.bounds).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } });
  });
});
