export interface TokenizedLine {
  /** e.g. "G1", "M83" — null if the line has no command word (pure comment/blank). */
  command: string | null;
  params: Record<string, number>;
  comment: string | null;
}

/** Splits a raw G-code line into its command, numeric params, and comment text. */
export function tokenizeLine(rawLine: string): TokenizedLine {
  let line = rawLine;
  let comment: string | null = null;

  const semiIdx = line.indexOf(';');
  if (semiIdx !== -1) {
    comment = line.slice(semiIdx + 1).trim();
    line = line.slice(0, semiIdx);
  }

  const parenMatch = line.match(/\(([^)]*)\)/);
  if (parenMatch) {
    comment = comment ? `${comment} ${parenMatch[1]}` : parenMatch[1];
    line = line.replace(/\([^)]*\)/g, '');
  }

  line = line.trim();
  if (line.length === 0) {
    return { command: null, params: {}, comment };
  }

  const parts = line.split(/\s+/);
  let command: string | null = null;
  const params: Record<string, number> = {};

  for (const part of parts) {
    const letter = part[0]?.toUpperCase();
    if (!letter || !/[A-Z]/.test(letter)) continue;
    if (letter === 'N') continue; // line number, not a param we track

    if ((letter === 'G' || letter === 'M') && command === null) {
      command = letter + part.slice(1);
      continue;
    }

    const value = parseFloat(part.slice(1));
    if (!Number.isNaN(value)) {
      params[letter] = value;
    }
  }

  return { command, params, comment };
}
