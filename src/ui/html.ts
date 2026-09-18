/** Escapes text for interpolation into the innerHTML the panels build. */
export function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

/** Formats a millimetre value, dropping to metres past 1000mm for readability. */
export function formatDistance(mm: number): string {
  if (mm >= 1000) return `${(mm / 1000).toFixed(2)} m`;
  return `${mm.toFixed(1)} mm`;
}
