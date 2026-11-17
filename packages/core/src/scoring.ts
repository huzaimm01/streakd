import type { GameAdapter, ScoringConfig } from './games.ts';

/** Points for a validated result. Thresholds are checked in order; first match wins. */
export function score(game: GameAdapter, success: boolean, value: number, cfg: ScoringConfig = game.scoring): number {
  if (!success) return cfg.failPoints;
  const hit = cfg.threshold.find((t) => (game.direction === 'lower' ? value <= t.limit : value >= t.limit));
  return Math.min(hit ? hit.points : cfg.floor, cfg.maxPoints);
}
