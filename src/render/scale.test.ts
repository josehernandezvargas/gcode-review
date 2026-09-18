import { describe, expect, it } from 'vitest';
import {
  classifyScale,
  resolveBeadSize,
  printBounds,
  isBeadWidthDerived,
  DESKTOP_PROFILE,
  LARGE_FORMAT_PROFILE,
} from './scale';
import type { ParseResult } from '../parser';

function makeResult(overrides: {
  spanX?: number;
  spanY?: number;
  layerHeightMm?: number;
  detectedLayerHeightMm?: number;
  nozzleDiameterMm?: number;
  extrusionBounds?: ParseResult['extrusionBounds'];
}): ParseResult {
  const spanX = overrides.spanX ?? 100;
  const spanY = overrides.spanY ?? 100;
  return {
    moves: [],
    layers: [],
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: spanX, y: spanY, z: 50 } },
    metadata: {
      raw: [],
      layerHeightMm: overrides.layerHeightMm,
      nozzleDiameterMm: overrides.nozzleDiameterMm,
    },
    lineCount: 0,
    detectedLayerHeightMm: overrides.detectedLayerHeightMm,
    totalExtrusionDistanceMm: 0,
    extrusionBounds: overrides.extrusionBounds,
  };
}

describe('classifyScale', () => {
  it('classifies a desktop-sized file with desktop layer heights as desktop', () => {
    expect(classifyScale(makeResult({ layerHeightMm: 0.2 })).id).toBe('desktop');
  });

  it('classifies by detected layer height when nothing is declared (bare 3DCP file)', () => {
    expect(classifyScale(makeResult({ detectedLayerHeightMm: 8 })).id).toBe('large-format');
  });

  it('classifies by XY span alone when layer height looks small', () => {
    expect(classifyScale(makeResult({ spanX: 1100, layerHeightMm: 0.2 })).id).toBe('large-format');
  });

  it('classifies a file with no metadata and small size as desktop', () => {
    expect(classifyScale(makeResult({})).id).toBe('desktop');
  });
});

describe('resolveBeadSize', () => {
  it('prefers declared metadata over everything', () => {
    const size = resolveBeadSize(
      makeResult({ layerHeightMm: 8, nozzleDiameterMm: 40, detectedLayerHeightMm: 5 }),
      LARGE_FORMAT_PROFILE,
    );
    expect(size.layerHeightMm).toBe(8);
    expect(size.beadWidthMm).toBe(40);
  });

  it('falls back to detected layer height and the profile width ratio', () => {
    const size = resolveBeadSize(makeResult({ detectedLayerHeightMm: 8 }), LARGE_FORMAT_PROFILE);
    expect(size.layerHeightMm).toBe(8);
    expect(size.beadWidthMm).toBe(16); // 2x layer height
  });

  it('falls back to profile defaults when the file reveals nothing', () => {
    const size = resolveBeadSize(makeResult({}), DESKTOP_PROFILE);
    expect(size.layerHeightMm).toBe(DESKTOP_PROFILE.layerHeight.default);
    expect(size.beadWidthMm).toBe(DESKTOP_PROFILE.beadWidth.default);
  });

  it('clamps out-of-range declared values into the profile slider range', () => {
    const size = resolveBeadSize(makeResult({ layerHeightMm: 8, nozzleDiameterMm: 40 }), DESKTOP_PROFILE);
    expect(size.layerHeightMm).toBe(DESKTOP_PROFILE.layerHeight.max);
    expect(size.beadWidthMm).toBe(DESKTOP_PROFILE.beadWidth.max);
  });
});

describe('printBounds', () => {
  it('prefers the extrusion bounds, so travel does not inflate the printed size', () => {
    const result = makeResult({
      spanX: 2000, // nozzle parks 2m out
      extrusionBounds: { min: { x: 0, y: 0, z: 8 }, max: { x: 300, y: 300, z: 120 } },
    });
    expect(printBounds(result).max.x).toBe(300);
    expect(printBounds(result).min.z).toBe(8);
  });

  it('falls back to the full bounds when a file deposits nothing', () => {
    expect(printBounds(makeResult({ spanX: 250 })).max.x).toBe(250);
  });

  it('classifies by the printed part, not by how far the nozzle travels', () => {
    const result = makeResult({
      spanX: 2000,
      layerHeightMm: 0.2,
      extrusionBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 180, y: 180, z: 50 } },
    });
    expect(classifyScale(result).id).toBe('desktop');
  });
});

describe('isBeadWidthDerived', () => {
  it('reports a deduced width for a headless file, and a declared one otherwise', () => {
    expect(isBeadWidthDerived(makeResult({ detectedLayerHeightMm: 8 }))).toBe(true);
    expect(isBeadWidthDerived(makeResult({ nozzleDiameterMm: 40 }))).toBe(false);
  });

  it('deduces bead width as twice the detected layer height when nothing is declared', () => {
    const result = makeResult({ detectedLayerHeightMm: 8 });
    const size = resolveBeadSize(result, LARGE_FORMAT_PROFILE);
    expect(size.layerHeightMm).toBeCloseTo(8);
    expect(size.beadWidthMm).toBeCloseTo(16);
  });
});
