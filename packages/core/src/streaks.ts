/** YYYY-MM-DD for an instant in an IANA timezone (the group's timezone). */
export function dateInTz(instant: Date | number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface StreakResult { current: number; longest: number; total: number }

/**
 * Derive streaks from a set of completed dates (group-local YYYY-MM-DD).
 * Current streak stays alive if today is not played yet but yesterday was.
 * Use for individual, per-game group, and overall group streaks alike.
 */
export function computeStreaks(dates: Iterable<string>, today: string): StreakResult {
  const set = new Set(dates);
  const sorted = [...set].sort();
  let longest = 0, run = 0, prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let cursor = set.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) { current++; cursor = addDays(cursor, -1); }
  return { current, longest, total: set.size };
}
