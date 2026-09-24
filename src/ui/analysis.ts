import type { AnalysisReport, Issue } from '../analysis';
import { escapeHtml, formatDistance } from './html';

export type AnalysisStatus =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'error'; message: string }
  | { state: 'ready'; report: AnalysisReport };

/** Issue rows to list per group before collapsing into "and N more". */
const ROWS_PER_GROUP = 5;

/**
 * Renders the analysis results. Issue rows are buttons carrying their layer
 * index in a data attribute; the caller listens on the container and jumps
 * the scrubber there.
 */
export function renderAnalysisPanel(container: HTMLElement, status: AnalysisStatus): void {
  if (status.state === 'idle') {
    container.innerHTML = '<p class="panel-hint">Load a file to run the checks.</p>';
    return;
  }
  if (status.state === 'running') {
    container.innerHTML = '<p class="panel-hint">Checking toolpath&hellip;</p>';
    return;
  }
  if (status.state === 'error') {
    container.innerHTML = `<p class="sidebar-warning">${escapeHtml(status.message)}</p>`;
    return;
  }

  const { report } = status;
  const summary = `
    <dl class="stats compact">
      <div class="stat"><dt>Extruded path</dt><dd>${formatDistance(report.summary.extrusionDistanceMm)}</dd></div>
      <div class="stat"><dt>Travel path</dt><dd>${formatDistance(report.summary.travelDistanceMm)}</dd></div>
    </dl>`;

  if (report.totalIssues === 0) {
    container.innerHTML = `${summary}<p class="panel-ok">No collisions or out-of-volume moves found${
      report.volumeName ? ` for the ${escapeHtml(report.volumeName)}` : ''
    }.</p>${caveat()}`;
    return;
  }

  const groups = report.groups
    .map((group) => {
      const rows = group.issues.slice(0, ROWS_PER_GROUP).map(issueRow).join('');
      const hidden = group.count - Math.min(group.issues.length, ROWS_PER_GROUP);
      const more = hidden > 0 ? `<li class="issue-more">and ${hidden.toLocaleString()} more</li>` : '';
      return `
        <section class="issue-group" data-kind="${escapeHtml(group.kind)}">
          <h3>${escapeHtml(group.label)} <span class="issue-count">${group.count.toLocaleString()}</span></h3>
          <ul class="issue-list">${rows}${more}</ul>
        </section>`;
    })
    .join('');

  const truncated = report.truncated
    ? '<p class="panel-hint">Scan stopped at its work limit — counts are a lower bound.</p>'
    : '';

  container.innerHTML = `${summary}${groups}${truncated}${caveat()}`;
}

function issueRow(issue: Issue): string {
  return `<li><button type="button" class="issue-row" data-layer="${issue.layerIndex}" data-move="${issue.moveIndex}">${escapeHtml(
    issue.message,
  )}</button></li>`;
}

function caveat(): string {
  return `<p class="panel-hint">Checks cover the toolpath and the selected build volume only — not gantry, ducts or clips.</p>`;
}
