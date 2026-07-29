export interface ExampleFile {
  fileName: string;
  label: string;
}

/** Bundled under public/gcode/ — real sample output from the user's own bioprinting export script. */
export const EXAMPLE_FILES: ExampleFile[] = [
  { fileName: '20260703_bioprint_test1.gcode', label: 'Bioprint test 1 (Jul 3)' },
  { fileName: '20260720_bioprint_test1.gcode', label: 'Bioprint test 1 (Jul 20)' },
  { fileName: '20260721_bioprint_test2.gcode', label: 'Bioprint test 2 (Jul 21)' },
  { fileName: '20260722_bioprint_test3.gcode', label: 'Bioprint test 3 (Jul 22)' },
];

/**
 * Fetches a bundled example file as a File the parser can consume. Uses a
 * root-relative-free path ("gcode/...", no leading slash) so it resolves
 * correctly under any deployed subpath, matching vite.config.ts's `base`.
 */
export async function loadExampleFile(fileName: string): Promise<File> {
  const response = await fetch(`gcode/${fileName}`);
  if (!response.ok) {
    throw new Error(`Could not load example file "${fileName}" (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  return new File([blob], fileName);
}
