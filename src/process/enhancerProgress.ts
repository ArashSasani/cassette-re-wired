/**
 * resemble_enhance emits a tqdm-style bar (coarse, no total-duration awareness).
 * This is best-effort progress, not a true percentage — report it as such.
 */
const TQDM_PERCENT = /(\d{1,3})%\|/;

export function parseTqdmPercent(line: string): number | null {
  const match = TQDM_PERCENT.exec(line);
  if (!match) return null;
  const percent = Number(match[1]);
  if (!Number.isFinite(percent)) return null;
  return Math.min(Math.max(percent / 100, 0), 1);
}
