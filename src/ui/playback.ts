export type ScrubMode = 'layers' | 'points';

export interface PlaybackElements {
  playPauseButton: HTMLButtonElement;
  scrubber: HTMLInputElement;
  label: HTMLElement;
  modeLayersRadio: HTMLInputElement;
  modePointsRadio: HTMLInputElement;
}

export interface PlaybackController {
  /** Call once a file is parsed, with its layer count and total move count. */
  setCounts(layerCount: number, moveCount: number): void;
  /** Stops playback and reveals up to `layerIndex`, switching to layer mode. */
  showLayer(layerIndex: number): void;
  dispose(): void;
}

const FRAME_INTERVAL_MS = 120;

/**
 * Drives the scrubber + play/pause button in one of two modes: revealing
 * whole layers, or revealing individual moves ("points") for finer-grained
 * scrubbing within a layer. Switching modes preserves the relative position.
 */
export function initPlayback(
  elements: PlaybackElements,
  onChange: (mode: ScrubMode, index: number) => void,
): PlaybackController {
  const { playPauseButton, scrubber, label, modeLayersRadio, modePointsRadio } = elements;

  let layerCount = 0;
  let moveCount = 0;
  let mode: ScrubMode = 'layers';
  let currentIndex = 0;
  let playing = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function totalFor(m: ScrubMode): number {
    return m === 'layers' ? layerCount : moveCount;
  }

  function updateLabel(): void {
    const total = totalFor(mode);
    const unit = mode === 'layers' ? 'Layer' : 'Point';
    label.textContent = `${unit} ${total > 0 ? currentIndex + 1 : 0} / ${total}`;
  }

  function applyRange(): void {
    scrubber.min = '0';
    scrubber.max = String(Math.max(0, totalFor(mode) - 1));
  }

  function setIndex(index: number): void {
    const total = totalFor(mode);
    currentIndex = Math.max(0, Math.min(index, Math.max(0, total - 1)));
    scrubber.value = String(currentIndex);
    updateLabel();
    onChange(mode, currentIndex);
  }

  function stop(): void {
    playing = false;
    playPauseButton.textContent = 'Play';
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function play(): void {
    const total = totalFor(mode);
    if (total === 0) return;
    if (currentIndex >= total - 1) currentIndex = -1; // restart from the bottom
    playing = true;
    playPauseButton.textContent = 'Pause';
    intervalId = setInterval(() => {
      if (currentIndex >= totalFor(mode) - 1) {
        stop();
        return;
      }
      setIndex(currentIndex + 1);
    }, FRAME_INTERVAL_MS);
  }

  function switchMode(next: ScrubMode): void {
    if (next === mode) return;
    stop();
    const prevTotal = totalFor(mode);
    const progress = prevTotal > 1 ? currentIndex / (prevTotal - 1) : 0;
    mode = next;
    applyRange();
    setIndex(Math.round(progress * Math.max(0, totalFor(mode) - 1)));
  }

  playPauseButton.addEventListener('click', () => {
    if (playing) stop();
    else play();
  });

  scrubber.addEventListener('input', () => {
    stop();
    setIndex(Number(scrubber.value));
  });

  modeLayersRadio.addEventListener('change', () => {
    if (modeLayersRadio.checked) switchMode('layers');
  });
  modePointsRadio.addEventListener('change', () => {
    if (modePointsRadio.checked) switchMode('points');
  });

  function setCounts(newLayerCount: number, newMoveCount: number): void {
    stop();
    layerCount = newLayerCount;
    moveCount = newMoveCount;
    applyRange();
    setIndex(totalFor(mode) > 0 ? totalFor(mode) - 1 : 0);
  }

  function showLayer(layerIndex: number): void {
    stop();
    if (mode !== 'layers') {
      modeLayersRadio.checked = true;
      switchMode('layers');
    }
    setIndex(layerIndex);
  }

  function dispose(): void {
    stop();
  }

  return { setCounts, showLayer, dispose };
}
