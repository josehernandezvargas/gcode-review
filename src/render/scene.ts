import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BUILD_PLATE_COLOR, GRID_COLOR_MAJOR, GRID_COLOR_MINOR } from './colors';
import type { Bounds } from '../parser';
import type { MachineProfile } from './machines';
import { disposeObjectTree, makeLabelSprite, setLabelHeight } from './labels';

export interface BuildVolumeOptions {
  bounds: Bounds;
  /** Omit (or leave undefined) to size the plate to the model's own bounds instead of a fixed machine volume. */
  machine?: MachineProfile;
}

export interface ViewerScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  /** Sizes/positions the build plate + grid, either fit to the model's own bounds or to a fixed machine volume. */
  setBuildVolume(options: BuildVolumeOptions): void;
  setScaleVisible(show: boolean): void;
  resize(): void;
  render(): void;
  dispose(): void;
}

const MAX_SCALE_TICKS = 8;

/** Picks a "nice" tick spacing (1/2/5 x a power of ten) for a given span, D3-tick-style. */
function niceInterval(span: number, maxTicks = MAX_SCALE_TICKS): number {
  if (span <= 0) return 1;
  const rough = span / maxTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / magnitude;
  let niceResidual: number;
  if (residual > 5) niceResidual = 10;
  else if (residual > 2) niceResidual = 5;
  else if (residual > 1) niceResidual = 2;
  else niceResidual = 1;
  return niceResidual * magnitude;
}

/** A row of tick marks + "Nmm" labels along the build plate's front edge, as a graphical scale reference. */
function buildScaleGroup(sizeX: number, minWorldX: number, frontWorldZ: number): THREE.Group {
  const group = new THREE.Group();
  const interval = niceInterval(sizeX);
  const tickHeight = Math.max(sizeX, 1) * 0.02;

  const tickPositions: number[] = [];
  for (let x = 0; x <= sizeX + 1e-6; x += interval) tickPositions.push(x);

  const linePoints: number[] = [];
  for (const x of tickPositions) {
    linePoints.push(minWorldX + x, 0, frontWorldZ, minWorldX + x, tickHeight, frontWorldZ);
  }
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3));
  group.add(new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: 0xcfd8dc })));

  const labelHeight = Math.max(sizeX, 1) * 0.05;
  for (const x of tickPositions) {
    const sprite = makeLabelSprite(`${Math.round(x)}mm`);
    setLabelHeight(sprite, labelHeight);
    sprite.position.set(minWorldX + x, tickHeight * 2.5, frontWorldZ);
    group.add(sprite);
  }

  return group;
}

export function createViewerScene(canvas: HTMLCanvasElement): ViewerScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);
  scene.add(new THREE.AxesHelper(50));
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(1, 2, 1); // gives tube geometry a visible highlight/shadow side
  scene.add(keyLight);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20000);
  camera.position.set(150, 150, 150);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  let buildPlate: THREE.Mesh | null = null;
  let grid: THREE.GridHelper | null = null;
  let volumeBox: THREE.LineSegments | null = null;
  let scaleGroup: THREE.Group | null = null;
  let scaleVisible = false;

  function setBuildVolume(options: BuildVolumeOptions): void {
    const { bounds, machine } = options;

    if (buildPlate) {
      scene.remove(buildPlate);
      buildPlate.geometry.dispose();
      (buildPlate.material as THREE.Material).dispose();
      buildPlate = null;
    }
    if (grid) {
      scene.remove(grid);
      grid.dispose();
      grid = null;
    }
    if (volumeBox) {
      scene.remove(volumeBox);
      volumeBox.geometry.dispose();
      (volumeBox.material as THREE.Material).dispose();
      volumeBox = null;
    }
    if (scaleGroup) {
      scene.remove(scaleGroup);
      disposeObjectTree(scaleGroup);
      scaleGroup = null;
    }

    let sizeX: number;
    let sizeY: number;
    let sizeZ: number;
    let centerX: number;
    let centerY: number;

    if (machine) {
      sizeX = machine.size.x;
      sizeY = machine.size.y;
      sizeZ = machine.size.z;
      centerX = machine.origin === 'center' ? 0 : sizeX / 2;
      centerY = machine.origin === 'center' ? 0 : sizeY / 2;
    } else {
      sizeX = Math.max(1, bounds.max.x - bounds.min.x);
      sizeY = Math.max(1, bounds.max.y - bounds.min.y);
      sizeZ = Math.max(1, bounds.max.z - bounds.min.z);
      centerX = (bounds.max.x + bounds.min.x) / 2;
      centerY = (bounds.max.y + bounds.min.y) / 2;
    }
    // Same X/Y -> X/-Z mapping used for the toolpath (see toolpath.ts).
    const centerZ = -centerY;

    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(sizeX, sizeY),
      new THREE.MeshBasicMaterial({
        color: BUILD_PLATE_COLOR,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3,
      }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(centerX, 0, centerZ);
    buildPlate = plate;
    scene.add(plate);

    const gridSize = Math.max(sizeX, sizeY) * (machine ? 1.05 : 1.2);
    const divisions = Math.max(2, Math.round(gridSize / 10));
    const gridHelper = new THREE.GridHelper(gridSize, divisions, GRID_COLOR_MAJOR, GRID_COLOR_MINOR);
    gridHelper.position.set(centerX, 0, centerZ);
    grid = gridHelper;
    scene.add(gridHelper);

    // The full 3D print volume only makes sense for a fixed machine profile — "fit to
    // model" has no defined height, so there's nothing to wrap in a volume box for it.
    if (machine) {
      const boxGeometry = new THREE.BoxGeometry(sizeX, sizeZ, sizeY);
      const edges = new THREE.EdgesGeometry(boxGeometry);
      boxGeometry.dispose();
      const box = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x6688aa, transparent: true, opacity: 0.6 }),
      );
      box.position.set(centerX, sizeZ / 2, centerZ);
      volumeBox = box;
      scene.add(box);
    }

    scaleGroup = buildScaleGroup(sizeX, centerX - sizeX / 2, centerZ + sizeY / 2);
    scaleGroup.visible = scaleVisible;
    scene.add(scaleGroup);

    const distance = Math.max(sizeX, sizeY, machine ? sizeZ : 0, 100) * 1.2;
    camera.position.set(centerX + distance * 0.7, distance * 0.8, centerZ + distance * 0.7);
    controls.target.set(centerX, 0, centerZ);
    controls.update();
  }

  function setScaleVisible(show: boolean): void {
    scaleVisible = show;
    if (scaleGroup) scaleGroup.visible = show;
  }

  function resize(): void {
    const parent = canvas.parentElement;
    const width = parent ? parent.clientWidth : window.innerWidth;
    const height = parent ? parent.clientHeight : window.innerHeight;
    camera.aspect = width / (height || 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function render(): void {
    controls.update();
    renderer.render(scene, camera);
  }

  function dispose(): void {
    if (buildPlate) {
      buildPlate.geometry.dispose();
      (buildPlate.material as THREE.Material).dispose();
    }
    grid?.dispose();
    if (volumeBox) {
      volumeBox.geometry.dispose();
      (volumeBox.material as THREE.Material).dispose();
    }
    disposeObjectTree(scaleGroup);
    controls.dispose();
    renderer.dispose();
  }

  resize();

  return { scene, camera, renderer, controls, setBuildVolume, setScaleVisible, resize, render, dispose };
}
