import { parseGCodeFile } from './worker/client';
import {
  createViewerScene,
  buildToolpath,
  MACHINE_PRESETS,
  FIT_TO_MODEL_ID,
  getMachineProfile,
  type ColorMode,
  type RenderMode,
  type Toolpath,
  type MachineProfile,
} from './render';
import { initDropZone, renderSidebar, initPlayback } from './ui';
import type { Bounds, ParseResult } from './parser';

const dropZone = document.getElementById('drop-zone') as HTMLElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const viewer = document.getElementById('viewer') as HTMLElement;
const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement;
const sidebar = document.getElementById('sidebar') as HTMLElement;
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
const machineSelect = document.getElementById('machine-select') as HTMLSelectElement;
const toggleScale = document.getElementById('toggle-scale') as HTMLInputElement;

for (const machine of MACHINE_PRESETS) {
  const option = document.createElement('option');
  option.value = machine.id;
  option.textContent = `${machine.name} (${machine.size.x}×${machine.size.y}×${machine.size.z}mm)`;
  machineSelect.appendChild(option);
}

const viewerScene = createViewerScene(canvas);
let currentToolpath: Toolpath | null = null;
let currentResult: ParseResult | null = null;
let currentFileName = '';

const playback = initPlayback(
  { playPauseButton, scrubber: layerScrubber, label: layerLabel, modeLayersRadio, modePointsRadio },
  (mode, index) => {
    if (mode === 'layers') currentToolpath?.setVisibleThroughLayer(index);
    else currentToolpath?.setVisibleThroughMove(index);
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

machineSelect.addEventListener('change', () => applyBuildVolume());
toggleScale.addEventListener('change', () => viewerScene.setScaleVisible(toggleScale.checked));

window.addEventListener('resize', () => viewerScene.resize());

initDropZone({ container: dropZone, input: fileInput }, (file) => {
  loadFile(file).catch((err) => {
    console.error('Failed to parse G-code file', err);
    alert(`Could not read this file as G-code: ${err instanceof Error ? err.message : err}`);
  });
});

/** Applies the currently selected machine (or "fit to model") to the scene and refreshes the sidebar warning. */
function applyBuildVolume(): void {
  if (!currentResult) return;
  const machine = machineSelect.value === FIT_TO_MODEL_ID ? undefined : getMachineProfile(machineSelect.value);
  viewerScene.setBuildVolume({ bounds: currentResult.bounds, machine });
  renderSidebar(sidebar, currentFileName, currentResult, outOfBoundsWarning(currentResult.bounds, machine));
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

  currentToolpath = buildToolpath(result.moves, result.layers);
  viewerScene.scene.add(currentToolpath.object);
  currentToolpath.setShowTravel(toggleTravel.checked);
  currentToolpath.setColorMode(colorModeSelect.value as ColorMode);
  currentToolpath.setRenderMode(renderModeSelect.value as RenderMode);
  currentToolpath.setExtrusionWidth(Number(extrusionWidthSlider.value));

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
