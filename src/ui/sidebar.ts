import type { ParseResult } from '../parser';
import { escapeHtml } from './html';

export interface SidebarOptions {
  /** e.g. "model exceeds the selected machine's build volume" — shown as a standalone banner. */
  warning?: string;
  /** Detected scale-profile name (e.g. "Large format (3DCP)"), shown as its own row. */
  scaleName?: string;
}

/**
 * Renders file stats. Every field beyond bbox/layers is optional — omitted
 * when absent from the file.
 */
export function renderSidebar(
  container: HTMLElement,
  fileName: string,
  result: ParseResult,
  options: SidebarOptions = {},
): void {
  const { bounds, layers, metadata } = result;
  const size = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };

  const rows: string[] = [
    row('File', fileName),
    row('Layers', String(layers.length)),
    row('Bounding box', `${fmt(size.x)} x ${fmt(size.y)} x ${fmt(size.z)} mm`),
  ];

  if (options.scaleName) rows.push(row('Scale', options.scaleName));
  if (metadata.slicer) rows.push(row('Slicer', metadata.slicer));
  if (metadata.material) rows.push(row('Material', metadata.material));
  if (metadata.printTimeSeconds !== undefined) {
    rows.push(row('Print time', formatDuration(metadata.printTimeSeconds)));
  }
  if (metadata.filamentUsedMm !== undefined) {
    rows.push(row('Filament', `${(metadata.filamentUsedMm / 1000).toFixed(2)} m`));
  }
  if (metadata.filamentUsedGrams !== undefined) {
    rows.push(row('Filament mass', `${fmt(metadata.filamentUsedGrams)} g`));
  }
  if (metadata.layerHeightMm !== undefined) {
    rows.push(row('Layer height', `${metadata.layerHeightMm.toFixed(2)} mm`));
  } else if (result.detectedLayerHeightMm !== undefined) {
    // Measured from the toolpath's Z steps, not declared by the file.
    rows.push(row('Layer height', `${fmt(result.detectedLayerHeightMm)} mm (measured)`));
  }
  if (metadata.nozzleDiameterMm !== undefined) {
    rows.push(row('Bead width', `${metadata.nozzleDiameterMm.toFixed(2)} mm`));
  }
  if (result.totalExtrusionDistanceMm > 0) {
    rows.push(row('Extruded path', formatLength(result.totalExtrusionDistanceMm)));
  }
  if (metadata.filamentType) rows.push(row('Filament type', metadata.filamentType));
  if (metadata.nozzleTempC !== undefined) rows.push(row('Nozzle temp', `${metadata.nozzleTempC}°C`));
  if (metadata.bedTempC !== undefined) rows.push(row('Bed temp', `${metadata.bedTempC}°C`));
  if (metadata.machineName) rows.push(row('Target machine', metadata.machineName));
  if (metadata.createdAt) rows.push(row('Created', metadata.createdAt));

  const warningHtml = options.warning ? `<p class="sidebar-warning">${escapeHtml(options.warning)}</p>` : '';
  container.innerHTML = `${warningHtml}<dl class="stats">${rows.join('')}</dl>`;
}

function formatLength(mm: number): string {
  return mm >= 10000 ? `${(mm / 1000).toFixed(1)} m` : `${fmt(mm)} mm`;
}

function row(label: string, value: string): string {
  return `<div class="stat"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function fmt(n: number): string {
  return n.toFixed(1);
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (h || m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}
