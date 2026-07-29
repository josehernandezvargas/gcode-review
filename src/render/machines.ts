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
  /** Lowercase name variants a slicer's TARGET_MACHINE.NAME/printer_model comment might use for this machine. */
  aliases: string[];
}

/** Sentinel id meaning "no fixed machine — size the plate to the loaded model's own bounds". */
export const FIT_TO_MODEL_ID = 'fit-to-model';

// Publicly documented build volumes from each manufacturer's spec sheet.
export const MACHINE_PRESETS: MachineProfile[] = [
  {
    id: 'ultimaker-s5',
    name: 'Ultimaker S5',
    size: { x: 330, y: 240, z: 300 },
    origin: 'corner',
    aliases: ['ultimaker s5', 's5'],
  },
  {
    id: 'ultimaker-2-plus',
    name: 'Ultimaker 2+',
    size: { x: 223, y: 223, z: 205 },
    origin: 'corner',
    aliases: ['ultimaker 2+', 'ultimaker2+', 'ultimaker 2 plus'],
  },
  {
    id: 'prusa-mk3s',
    name: 'Prusa i3 MK3S+',
    size: { x: 250, y: 210, z: 210 },
    origin: 'corner',
    aliases: ['mk3s', 'mk3s+', 'mk3', 'i3 mk3s', 'original prusa i3 mk3s', 'prusa i3 mk3s'],
  },
  {
    id: 'ender-3',
    name: 'Creality Ender 3',
    size: { x: 220, y: 220, z: 250 },
    origin: 'corner',
    aliases: ['ender-3', 'ender 3', 'ender3', 'creality ender 3'],
  },
  {
    id: 'bambu-x1c',
    name: 'Bambu Lab X1 Carbon',
    size: { x: 256, y: 256, z: 256 },
    origin: 'center',
    aliases: ['x1 carbon', 'x1c', 'bambu lab x1 carbon', 'bambu x1 carbon'],
  },
];

export function getMachineProfile(id: string): MachineProfile | undefined {
  return MACHINE_PRESETS.find((machine) => machine.id === id);
}

/**
 * Best-effort match of a slicer-declared machine name (e.g. from
 * `;TARGET_MACHINE.NAME:` or `; printer_model =`) against the known preset
 * list. Never fabricates a match — returns undefined for anything not
 * recognized, rather than guessing.
 */
export function findMachineByName(name: string): MachineProfile | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;

  return MACHINE_PRESETS.find((machine) => {
    if (machine.name.toLowerCase() === normalized) return true;
    return machine.aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized));
  });
}
