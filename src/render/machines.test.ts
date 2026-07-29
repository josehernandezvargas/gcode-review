import { describe, expect, it } from 'vitest';
import { findMachineByName } from './machines';

describe('findMachineByName', () => {
  it('matches an exact preset name', () => {
    expect(findMachineByName('Ultimaker S5')?.id).toBe('ultimaker-s5');
  });

  it('matches a short alias like a PrusaSlicer printer_model value', () => {
    expect(findMachineByName('MK3S')?.id).toBe('prusa-mk3s');
  });

  it('matches case-insensitively and with surrounding whitespace', () => {
    expect(findMachineByName('  ender-3  ')?.id).toBe('ender-3');
  });

  it('matches the Ultimaker 2+ name from the real example files (TARGET_MACHINE.NAME)', () => {
    expect(findMachineByName('Ultimaker 2+')?.id).toBe('ultimaker-2-plus');
  });

  it('returns undefined for an unrecognized machine name rather than guessing', () => {
    expect(findMachineByName('Some Custom Delta Printer')).toBeUndefined();
  });

  it('returns undefined for an empty name', () => {
    expect(findMachineByName('')).toBeUndefined();
  });
});
