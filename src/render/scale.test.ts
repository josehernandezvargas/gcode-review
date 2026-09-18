import { describe, expect, it } from 'vitest';
import { classifyScale, resolveBeadSize, DESKTOP_PROFILE, LARGE_FORMAT_PROFILE } from './scale';
import type { ParseResult } from '../parser';

function makeResult(overrides: {
  spanX?: number;
  spanY?: number;
  layerHeightMm?: number;
  detectedLayerHeightMm?: number;
  nozzleDiameterMm?: number;
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
