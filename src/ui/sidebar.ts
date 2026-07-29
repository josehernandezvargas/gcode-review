import type { ParseResult } from '../parser';
import { escapeHtml } from './html';

/**
 * Renders file stats. Every field beyond bbox/layers is optional — omitted
 * when absent from the file. `warning`, if given (e.g. "model exceeds the
 * selected machine's build volume"), is shown as a standalone banner.
 */
export function renderSidebar(container: HTMLElement, fileName: string, result: ParseResult, warning?: string): void {
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

  if (metadata.slicer) rows.push(row('Slicer', metadata.slicer));
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
  }
  if (metadata.nozzleDiameterMm !== undefined) {
    rows.push(row('Nozzle diameter', `${metadata.nozzleDiameterMm.toFixed(2)} mm`));
  }
  if (metadata.filamentType) rows.push(row('Filament type', metadata.filamentType));
  if (metadata.nozzleTempC !== undefined) rows.push(row('Nozzle temp', `${metadata.nozzleTempC}°C`));
  if (metadata.bedTempC !== undefined) rows.push(row('Bed temp', `${metadata.bedTempC}°C`));
  if (metadata.machineName) rows.push(row('Target machine', metadata.machineName));
  if (metadata.createdAt) rows.push(row('Created', metadata.createdAt));

  const warningHtml = warning ? `<p class="sidebar-warning">${escapeHtml(warning)}</p>` : '';
  container.innerHTML = `${warningHtml}<dl class="stats">${rows.join('')}</dl>`;
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
