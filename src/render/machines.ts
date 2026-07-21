/**
 * Machine print-volume framework: a small, extensible list of known build
 * volumes so the viewer can show "does this model fit on machine X" instead
 * of only ever fitting the plate to the model's own bounds (SPEC.md §5's
 * default). Pure data — no Three.js/DOM here, so it's safe to import from
 * both src/render and src/ui.
 */
export interface MachineProfile {
  id: string;
  name: string;
  /** Build volume size in mm. */
  size: { x: number; y: number; z: number };
  /** Where (0,0) sits in XY relative to the volume. Most FDM firmwares use a front-left corner origin. */
  origin: 'corner' | 'center';
}

/** Sentinel id meaning "no fixed machine — size the plate to the loaded model's own bounds". */
export const FIT_TO_MODEL_ID = 'fit-to-model';

// Publicly documented build volumes from each manufacturer's spec sheet.
export const MACHINE_PRESETS: MachineProfile[] = [
  { id: 'ultimaker-s5', name: 'Ultimaker S5', size: { x: 330, y: 240, z: 300 }, origin: 'corner' },
  { id: 'prusa-mk3s', name: 'Prusa i3 MK3S+', size: { x: 250, y: 210, z: 210 }, origin: 'corner' },
  { id: 'ender-3', name: 'Creality Ender 3', size: { x: 220, y: 220, z: 250 }, origin: 'corner' },
  { id: 'bambu-x1c', name: 'Bambu Lab X1 Carbon', size: { x: 256, y: 256, z: 256 }, origin: 'center' },
];

export function getMachineProfile(id: string): MachineProfile | undefined {
  return MACHINE_PRESETS.find((machine) => machine.id === id);
}
