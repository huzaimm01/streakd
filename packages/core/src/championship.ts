export interface ScoredSubmission { userId: string; gameId: string; date: string; points: number; submittedAt: number }
export interface Standing {
  userId: string; rank: number; total: number; perGame: Record<string, number>;
  completed: number; topScores: number; average: number; reachedAt: number;
}

/**
 * Monthly standings from scored PRESET-game submissions (callers must exclude custom games).
 * Tiebreakers, in order: points, most top-scoring results, higher average, earlier time the
 * final total was reached, then userId so output is fully deterministic.
 */
export function standingsForMonth(subs: ScoredSubmission[], month: string, maxPoints = 10): Standing[] {
  const by = new Map<string, Standing>();
  for (const s of subs) {
    if (!s.date.startsWith(month)) continue;
    const st = by.get(s.userId) ?? { userId: s.userId, rank: 0, total: 0, perGame: {}, completed: 0, topScores: 0, average: 0, reachedAt: 0 };
    st.total += s.points;
    st.perGame[s.gameId] = (st.perGame[s.gameId] ?? 0) + s.points;
    st.completed++;
    if (s.points >= maxPoints) st.topScores++;
    st.reachedAt = Math.max(st.reachedAt, s.submittedAt);
    by.set(s.userId, st);
  }
  const list = [...by.values()];
  for (const st of list) st.average = st.completed ? st.total / st.completed : 0;
  list.sort((a, b) =>
    b.total - a.total || b.topScores - a.topScores || b.average - a.average || a.reachedAt - b.reachedAt || a.userId.localeCompare(b.userId));
  list.forEach((st, i) => (st.rank = i + 1));
  return list;
}

/** Positive = moved up. Compare standings now vs. an earlier snapshot. */
export function rankChanges(prev: Standing[], curr: Standing[]): Record<string, number> {
  const before = new Map(prev.map((s) => [s.userId, s.rank]));
  return Object.fromEntries(curr.map((s) => [s.userId, before.has(s.userId) ? before.get(s.userId)! - s.rank : 0]));
}
