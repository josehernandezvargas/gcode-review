import { analyzeToolpathAsync, parseGCodeFile } from './worker/client';
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
  machineBuildVolume,
  createBoundingBoxHelper,
  createIssueMarkers,
  createMeasureTool,
  type Annotation,
  type ColorMode,
  type RenderMode,
  type Toolpath,
  type MachineProfile,
  type SliderRange,
} from './render';
import {
  initDropZone,
  renderSidebar,
  initPlayback,
  renderMeasurePanel,
  renderAnalysisPanel,
  EXAMPLE_FILES,
  loadExampleFile,
  type AnalysisStatus,
} from './ui';
import { extractVertices, packToolpath, type AnalysisReport, type PackedToolpath } from './analysis';
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
const toggleBoundingBox = document.getElementById('toggle-bounding-box') as HTMLInputElement;
const toggleIssueMarkers = document.getElementById('toggle-issue-markers') as HTMLInputElement;
const measureToggle = document.getElementById('measure-toggle') as HTMLButtonElement;
const measureClear = document.getElementById('measure-clear') as HTMLButtonElement;
const measureReadout = document.getElementById('measure-readout') as HTMLElement;
const analysisRunButton = document.getElementById('analysis-run') as HTMLButtonElement;
const analysisResults = document.getElementById('analysis-results') as HTMLElement;

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
let packed: PackedToolpath | null = null;
let boundingBox: Annotation | null = null;
let issueMarkers: Annotation | null = null;
let currentReport: AnalysisReport | null = null;
let pendingAnalysis: { cancel(): void } | null = null;

const measureTool = createMeasureTool(viewerScene.camera, (state) => {
  renderMeasurePanel(measureReadout, state);
});
viewerScene.scene.add(measureTool.object);
renderMeasurePanel(measureReadout, measureTool.getState());
renderAnalysisPanel(analysisResults, { state: 'idle' });

const playback = initPlayback(
  { playPauseButton, scrubber: layerScrubber, label: layerLabel, modeLayersRadio, modePointsRadio },
  (mode, index) => {
    if (currentToolpath) {
      if (mode === 'layers') {
        currentToolpath.setVisibleThroughLayer(index);
        currentToolpath.setPointMarkerVisible(false);
      } else {
        currentToolpath.setVisibleThroughMove(index);
        currentToolpath.setPointMarkerVisible(true);
      }
    }
    syncMeasureVisibility();
  },
);

/** Keeps measurement snapping to the part of the toolpath the scrubber reveals. */
function syncMeasureVisibility(): void {
  const visibleMoves = currentToolpath?.getVisibleMoveCount() ?? 0;
  measureTool.setVisibleVertexCount(visibleMoves > 0 ? visibleMoves + 1 : 0);
}

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

machineSelect.addEventListener('change', () => {
  applyBuildVolume();
  runAnalysis();
});
toggleScale.addEventListener('change', () => viewerScene.setScaleVisible(toggleScale.checked));
toggleBoundingBox.addEventListener('change', () => refreshBoundingBox());
toggleIssueMarkers.addEventListener('change', () => refreshIssueMarkers());

loadNewButton.addEventListener('click', () => fileInput.click());

measureToggle.addEventListener('click', () => {
  const enabled = measureToggle.getAttribute('aria-pressed') !== 'true';
  measureToggle.setAttribute('aria-pressed', String(enabled));
  measureToggle.textContent = enabled ? 'On' : 'Off';
  canvas.classList.toggle('measuring', enabled);
  measureTool.setEnabled(enabled);
  if (enabled) syncMeasureVisibility();
});

measureClear.addEventListener('click', () => measureTool.clear());

// Distinguishes a measurement click from an orbit drag: OrbitControls owns the
// same pointer events, so only a near-stationary press counts as a pick.
let pointerDownAt: { x: number; y: number } | null = null;
const CLICK_SLOP_PX = 4;

canvas.addEventListener('pointerdown', (event) => {
  pointerDownAt = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener('pointerup', (event) => {
  const down = pointerDownAt;
  pointerDownAt = null;
  if (!down || !measureTool.getState().enabled) return;
  if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_SLOP_PX) return;
  const rect = canvas.getBoundingClientRect();
  measureTool.pick(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
});

analysisRunButton.addEventListener('click', () => runAnalysis());

analysisResults.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest('.issue-row');
  if (!(target instanceof HTMLElement)) return;
  const layer = Number(target.dataset.layer);
  if (Number.isFinite(layer)) playback.showLayer(layer);
});

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

/** Largest model dimension, used to scale in-scene annotations. */
function sceneSize(): number {
  if (!currentResult) return 100;
  const { min, max } = currentResult.bounds;
  return Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1);
}

/**
 * Bounds for the drawn box. Extrusion-only bounds are preferred once the
 * analysis has run — priming lines and parking travel can sit well outside
 * the printed part, which is what the box is supposed to describe.
 */
function printBounds(): Bounds | null {
  if (currentReport?.summary.printBounds) return currentReport.summary.printBounds;
  return currentResult?.bounds ?? null;
}

function refreshBoundingBox(): void {
  if (boundingBox) {
    viewerScene.scene.remove(boundingBox.object);
    boundingBox.dispose();
    boundingBox = null;
  }
  const bounds = printBounds();
  if (!toggleBoundingBox.checked || !bounds) return;
  boundingBox = createBoundingBoxHelper(bounds);
  viewerScene.scene.add(boundingBox.object);
}

function refreshIssueMarkers(): void {
  if (issueMarkers) {
    viewerScene.scene.remove(issueMarkers.object);
    issueMarkers.dispose();
    issueMarkers = null;
  }
  if (!toggleIssueMarkers.checked || !currentReport) return;
  issueMarkers = createIssueMarkers(currentReport.groups, sceneSize());
  viewerScene.scene.add(issueMarkers.object);
}

/** Runs the collision/volume checks in a worker; a newer run supersedes an in-flight one. */
function runAnalysis(): void {
  if (!packed) return;
  pendingAnalysis?.cancel();
  currentReport = null;
  refreshIssueMarkers();
  renderAnalysisPanel(analysisResults, { state: 'running' });

  const machine = selectedMachine();
  const run = analyzeToolpathAsync(packed, {
    volume: machine ? machineBuildVolume(machine) : undefined,
  });
  pendingAnalysis = run;

  run.promise
    .then((report) => {
      pendingAnalysis = null;
      currentReport = report;
      const status: AnalysisStatus = { state: 'ready', report };
      renderAnalysisPanel(analysisResults, status);
      refreshIssueMarkers();
      refreshBoundingBox();
    })
    .catch((err: unknown) => {
      if (err instanceof Error && err.name === 'AbortError') return;
      pendingAnalysis = null;
      const message = err instanceof Error ? err.message : String(err);
      renderAnalysisPanel(analysisResults, { state: 'error', message: `Analysis failed: ${message}` });
    });
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
  currentReport = null;

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

  packed = packToolpath(result.moves, result.layers);
  measureTool.setVertices(extractVertices(packed));
  measureTool.setSceneSize(sceneSize());

  applyBuildVolume();
  playback.setCounts(result.layers.length, result.moves.length);
  syncMeasureVisibility();
  refreshBoundingBox();
  runAnalysis();

  dropZone.hidden = true;
  viewer.hidden = false;
  viewerScene.resize();
}

function animate(): void {
  requestAnimationFrame(animate);
  viewerScene.render();
}
animate();
