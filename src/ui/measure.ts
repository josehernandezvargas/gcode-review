import type { MeasureState } from '../render';
import { escapeHtml } from './html';

/**
 * Readout for the measurement tool. Rendered as DOM rather than in-scene
 * text so the numbers stay crisp and selectable; the scene itself only shows
 * the picked points, the span and the per-axis breakdown.
 */
export function renderMeasurePanel(container: HTMLElement, state: MeasureState): void {
  if (!state.enabled) {
    container.innerHTML = '<p class="panel-hint">Turn on to measure between two toolpath points.</p>';
    return;
  }

  if (!state.result) {
    const hint = state.from
      ? `From X${fmt(state.from.x)} Y${fmt(state.from.y)} Z${fmt(state.from.z)} — click a second point.`
      : 'Click a point on the toolpath. Points snap to G-code coordinates.';
    return void (container.innerHTML = `<p class="panel-hint">${escapeHtml(hint)}</p>`);
  }

  const { a, b, dx, dy, dz, distanceXY, distance } = state.result;
  container.innerHTML = `
    <dl class="stats compact">
      ${row('From', `X${fmt(a.x)} Y${fmt(a.y)} Z${fmt(a.z)}`)}
      ${row('To', `X${fmt(b.x)} Y${fmt(b.y)} Z${fmt(b.z)}`)}
      ${row('&Delta;X / &Delta;Y / &Delta;Z', `${fmt(dx)} / ${fmt(dy)} / ${fmt(dz)} mm`)}
      ${row('XY distance', `${fmt(distanceXY)} mm`)}
      ${row('Distance', `${fmt(distance)} mm`)}
    </dl>`;
}

function row(label: string, value: string): string {
  // `label` is trusted markup from the call sites above (it carries entities);
  // `value` is always escaped.
  return `<div class="stat"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function fmt(value: number): string {
  return value.toFixed(2);
}
