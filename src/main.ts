import { parseGCodeFile } from './worker/client';
import {
  createViewerScene,
  buildToolpath,
  MACHINE_PRESETS,
  FIT_TO_MODEL_ID,
  FILE_DECLARED_MACHINE_ID,
  getMachineProfile,
  findMachineByName,
  machineFromMetadata,
  classifyScale,
  resolveBeadSize,
  type ColorMode,
  type RenderMode,
  type Toolpath,
  type MachineProfile,
  type SliderRange,
} from './render';
import { initDropZone, renderSidebar, initPlayback, EXAMPLE_FILES, loadExampleFile } from './ui';
import type { Bounds, ParseResult } from './parser';

const dropZone = document.getElementById('drop-zone') as HTMLElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const viewer = document.getElementById('viewer') as HTMLElement;
const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement;
const loadNewButton = document.getElementById('load-new') as HTMLButtonElement;
const sidebarContent = document.getElementById('sidebar-content') as HTMLElement;
const playPauseButton = document.getElementById('play-pause') as HTMLButtonElement;
const layerScrubber = document.getElementById('layer-scrubber') as HTMLInputElement;
const layerLabel = document.getElementById('layer-label') as HTMLElement;
const modeLayersRadio = document.getElementById('mode-layers') as HTMLInputElement;
const modePointsRadio = document.getElementById('mode-points') as HTMLInputElement;
const toggleTravel = document.getElementById('toggle-travel') as HTMLInputElement;
const colorModeSelect = document.getElementById('color-mode') as HTMLSelectElement;
const settingsToggle = document.getElementById('settings-toggle') as HTMLButtonElement;
const settingsPanel = document.getElementById('settings-panel') as HTMLElement;
const renderModeSelect = document.getElementById('render-mode') as HTMLSelectElement;
const extrusionWidthSlider = document.getElementById('extrusion-width') as HTMLInputElement;
const extrusionWidthLabel = document.getElementById('extrusion-width-label') as HTMLElement;
const layerHeightSlider = document.getElementById('layer-height') as HTMLInputElement;
const layerHeightLabel = document.getElementById('layer-height-label') as HTMLElement;
const machineSelect = document.getElementById('machine-select') as HTMLSelectElement;
const toggleScale = document.getElementById('toggle-scale') as HTMLInputElement;
const exampleFileList = document.getElementById('example-file-list') as HTMLElement;

for (const machine of MACHINE_PRESETS) {
  const option = document.createElement('option');
  option.value = machine.id;
  option.textContent = `${machine.name} (${machine.size.x}×${machine.size.y}×${machine.size.z}mm)`;
  machineSelect.appendChild(option);
}

for (const example of EXAMPLE_FILES) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = example.label;
  button.addEventListener('click', (event) => {
    // Stop this from bubbling to #drop-zone's own click handler, which would
    // also pop open the native file picker on top of loading the example.
    event.stopPropagation();
    loadExampleFile(example.fileName)
      .then((file) => loadFile(file))
      .catch((err) => {
        console.error('Failed to load example file', err);
        alert(`Could not load example file: ${err instanceof Error ? err.message : err}`);
      });
  });
  item.appendChild(button);
  exampleFileList.appendChild(item);
}

const viewerScene = createViewerScene(canvas);
let currentToolpath: Toolpath | null = null;
let currentResult: ParseResult | null = null;
let currentFileName = '';
let currentScaleName = '';
/** Machine profile built from the loaded file's own `;Build volume:` header, if it has one. */
let fileDeclaredMachine: MachineProfile | null = null;

const playback = initPlayback(
  { playPauseButton, scrubber: layerScrubber, label: layerLabel, modeLayersRadio, modePointsRadio },
  (mode, index) => {
    if (!currentToolpath) return;
    if (mode === 'layers') {
      currentToolpath.setVisibleThroughLayer(index);
      currentToolpath.setPointMarkerVisible(false);
    } else {
      currentToolpath.setVisibleThroughMove(index);
      currentToolpath.setPointMarkerVisible(true);
    }
  },
);

toggleTravel.addEventListener('change', () => {
  currentToolpath?.setShowTravel(toggleTravel.checked);
});

colorModeSelect.addEventListener('change', () => {
  currentToolpath?.setColorMode(colorModeSelect.value as ColorMode);
});

settingsToggle.addEventListener('click', () => {
  const isHidden = settingsPanel.hidden;
  settingsPanel.hidden = !isHidden;
  settingsToggle.setAttribute('aria-expanded', String(isHidden));
});

renderModeSelect.addEventListener('change', () => {
  currentToolpath?.setRenderMode(renderModeSelect.value as RenderMode);
});

extrusionWidthSlider.addEventListener('input', () => {
  const width = Number(extrusionWidthSlider.value);
  extrusionWidthLabel.textContent = `${width.toFixed(2)} mm`;
  currentToolpath?.setExtrusionWidth(width);
});

layerHeightSlider.addEventListener('input', () => {
  const height = Number(layerHeightSlider.value);
  layerHeightLabel.textContent = `${height.toFixed(2)} mm`;
  currentToolpath?.setLayerHeight(height);
});

machineSelect.addEventListener('change', () => applyBuildVolume());
toggleScale.addEventListener('change', () => viewerScene.setScaleVisible(toggleScale.checked));

loadNewButton.addEventListener('click', () => fileInput.click());

window.addEventListener('resize', () => viewerScene.resize());

initDropZone({ container: dropZone, input: fileInput }, (file) => {
  loadFile(file).catch((err) => {
    console.error('Failed to parse G-code file', err);
    alert(`Could not read this file as G-code: ${err instanceof Error ? err.message : err}`);
  });
});

/** Resolves the machine select's value to a profile: preset, the loaded file's own declared machine, or none. */
function selectedMachine(): MachineProfile | undefined {
  if (machineSelect.value === FIT_TO_MODEL_ID) return undefined;
  if (machineSelect.value === FILE_DECLARED_MACHINE_ID) return fileDeclaredMachine ?? undefined;
  return getMachineProfile(machineSelect.value);
}

/** Applies the currently selected machine (or "fit to model") to the scene and refreshes the sidebar warning. */
function applyBuildVolume(): void {
  if (!currentResult) return;
  const machine = selectedMachine();
  renderSidebar(sidebarContent, currentFileName, currentResult, {
    warning: outOfBoundsWarning(currentResult.bounds, machine),
    scaleName: currentScaleName,
  });
  viewerScene.setBuildVolume({ bounds: currentResult.bounds, machine });
}

/** Reconfigures a range slider to a profile's min/max/step and sets its value + label. */
function configureSlider(slider: HTMLInputElement, label: HTMLElement, range: SliderRange, value: number): void {
  slider.min = String(range.min);
  slider.max = String(range.max);
  slider.step = String(range.step);
  slider.value = String(value);
  label.textContent = `${value.toFixed(2)} mm`;
}

/** Adds/removes the "machine from file header" option in the machine dropdown for the file just loaded. */
function updateFileDeclaredMachineOption(): void {
  const existing = machineSelect.querySelector<HTMLOptionElement>(`option[value="${FILE_DECLARED_MACHINE_ID}"]`);
  existing?.remove();
  if (machineSelect.value === '') machineSelect.value = FIT_TO_MODEL_ID;
  if (!fileDeclaredMachine) return;

  const option = document.createElement('option');
  option.value = FILE_DECLARED_MACHINE_ID;
  const { x, y, z } = fileDeclaredMachine.size;
  option.textContent = `${fileDeclaredMachine.name} (${x}×${y}×${z}mm, from file)`;
  machineSelect.appendChild(option);
  machineSelect.value = FILE_DECLARED_MACHINE_ID;
}

function outOfBoundsWarning(bounds: Bounds, machine: MachineProfile | undefined): string | undefined {
  if (!machine) return undefined;
  const sizeX = bounds.max.x - bounds.min.x;
  const sizeY = bounds.max.y - bounds.min.y;
  const sizeZ = bounds.max.z - bounds.min.z;
  if (sizeX > machine.size.x || sizeY > machine.size.y || sizeZ > machine.size.z) {
    return `Model exceeds the ${machine.name}'s build volume.`;
  }
  return undefined;
}

async function loadFile(file: File): Promise<void> {
  const result = await parseGCodeFile(file);
  currentResult = result;
  currentFileName = file.name;

  if (currentToolpath) {
    viewerScene.scene.remove(currentToolpath.object);
    currentToolpath.dispose();
  }

  // Desktop FDM and large-format (3DCP) files get different bead-size slider
  // ranges and defaults — a 0.4mm nozzle scale is useless for 8mm concrete layers.
  const profile = classifyScale(result);
  currentScaleName = profile.name;

  currentToolpath = buildToolpath(result.moves, result.layers, profile);
  viewerScene.scene.add(currentToolpath.object);
  currentToolpath.setShowTravel(toggleTravel.checked);
  currentToolpath.setColorMode(colorModeSelect.value as ColorMode);
  currentToolpath.setRenderMode(renderModeSelect.value as RenderMode);

  // Prefer the file's own declared bead width/layer height, then sizes
  // measured from its geometry, over whatever a previous file left behind.
  const { beadWidthMm, layerHeightMm } = resolveBeadSize(result, profile);
  configureSlider(extrusionWidthSlider, extrusionWidthLabel, profile.beadWidth, beadWidthMm);
  currentToolpath.setExtrusionWidth(beadWidthMm);
  configureSlider(layerHeightSlider, layerHeightLabel, profile.layerHeight, layerHeightMm);
  currentToolpath.setLayerHeight(layerHeightMm);

  // A build volume declared in the file's header beats preset matching by name.
  fileDeclaredMachine = machineFromMetadata(result.metadata) ?? null;
  updateFileDeclaredMachineOption();
  if (!fileDeclaredMachine && result.metadata.machineName) {
    const matched = findMachineByName(result.metadata.machineName);
    if (matched) machineSelect.value = matched.id;
  }

  applyBuildVolume();
  playback.setCounts(result.layers.length, result.moves.length);

  dropZone.hidden = true;
  viewer.hidden = false;
  viewerScene.resize();
}

function animate(): void {
  requestAnimationFrame(animate);
  viewerScene.render();
}
animate();
