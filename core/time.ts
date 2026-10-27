// Taiwan has no DST, so a fixed +08:00 offset is exact.
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD in Asia/Taipei for an ISO timestamp or Date. */
export function taipeiDate(at: string | Date): string {
  const ms = typeof at === 'string' ? Date.parse(at) : at.getTime();
  return new Date(ms + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM in Asia/Taipei. */
export function taipeiMonth(at: string | Date): string {
  return taipeiDate(at).slice(0, 7);
}

/** Parse "2026-10-26 02:07:37" (Taipei local time) to an ISO UTC string. */
export function taipeiLocalToIso(local: string): string | null {
  const m = local.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0) - TAIPEI_OFFSET_MS;
  return new Date(utc).toISOString();
}

/** Add days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (YYYY-MM-DD). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS);
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** Date in a given month with the day clamped to the month length (e.g. 31 -> 30 in Nov). */
export function clampedDate(year: number, month1to12: number, day: number): string {
  const d = Math.min(day, daysInMonth(year, month1to12));
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Budget cycle containing `today`. The cycle starts on `startDay` and ends
 * the day before the next start. Returns inclusive start / exclusive end.
 */
export function budgetCycle(today: string, startDay: number): { start: string; end: string } {
  const [y, m, d] = today.split('-').map(Number);
  let sy = y;
  let sm = m;
  if (d < startDay) {
    sm -= 1;
    if (sm === 0) {
      sm = 12;
      sy -= 1;
    }
  }
  const start = clampedDate(sy, sm, startDay);
  let ey = sy;
  let em = sm + 1;
  if (em === 13) {
    em = 1;
    ey += 1;
  }
  const end = clampedDate(ey, em, startDay);
  return { start, end };
}

/** Monday-start week containing `date`. */
export function weekStart(date: string): string {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay(); // 0 = Sun
  const offset = (dow + 6) % 7;
  return addDays(date, -offset);
}

export function minutesBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 60000;
}
