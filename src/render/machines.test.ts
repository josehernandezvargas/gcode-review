import { describe, expect, it } from 'vitest';
import { FILE_DECLARED_MACHINE_ID, findMachineByName, machineFromMetadata } from './machines';

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

describe('machineFromMetadata', () => {
  it('builds a profile from a header-declared build volume, origin, and name', () => {
    const machine = machineFromMetadata({
      buildVolume: { x: 1200, y: 600, z: 600 },
      originMode: 'center',
      machineName: 'RISE E3D gantry',
    });
    expect(machine?.id).toBe(FILE_DECLARED_MACHINE_ID);
    expect(machine?.name).toBe('RISE E3D gantry');
    expect(machine?.size).toEqual({ x: 1200, y: 600, z: 600 });
    expect(machine?.origin).toBe('center');
  });

  it('defaults origin to corner and names the profile generically when unspecified', () => {
    const machine = machineFromMetadata({ buildVolume: { x: 300, y: 300, z: 300 } });
    expect(machine?.origin).toBe('corner');
    expect(machine?.name).toBe('Machine from file header');
  });

  it('returns undefined without a declared build volume — a name alone is not a volume', () => {
    expect(machineFromMetadata({ machineName: 'Some machine' })).toBeUndefined();
    expect(machineFromMetadata({ buildVolume: { x: 0, y: 600, z: 600 } })).toBeUndefined();
  });
});
