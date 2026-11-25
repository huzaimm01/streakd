export type Direction = 'lower' | 'higher';
export interface Threshold { limit: number; points: number }
export interface ScoringConfig { threshold: Threshold[]; floor: number; failPoints: number; maxPoints: number; version: number }
export type Parsed = { ok: true; success: boolean; value: number } | { ok: false; error: string };

export interface GameAdapter {
  id: string; name: string; icon: string; description: string; url: string;
  direction: Direction; inputHint: string;
  validate(raw: unknown): Parsed;
  format(value: number, success: boolean): string;
  scoring: ScoringConfig;
}

const FAIL = 'X';
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const bad = (error: string): Parsed => ({ ok: false, error });

/** Guess-count games with a fixed max (Wordle, Worldle, Flagle). 'X' = failed. */
function guessGame(id: string, name: string, icon: string, description: string, url: string, max: number, ladder: number[]): GameAdapter {
  return {
    id, name, icon, description, url, direction: 'lower', inputHint: `1-${max}, or X if failed`,
    validate: (raw) => {
      if (typeof raw === 'string' && raw.toUpperCase() === FAIL) return { ok: true, success: false, value: max + 1 };
      const n = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
      if (!isInt(n) || n < 1 || n > max) return bad(`Enter 1-${max} or X`);
      return { ok: true, success: true, value: n };
    },
    format: (v, s) => (s ? `${v}/${max}` : `X/${max}`),
    scoring: { threshold: ladder.map((points, i) => ({ limit: i + 1, points })), floor: 1, failPoints: 0, maxPoints: 10, version: 1 },
  };
}

// Krillion: 7 rounds, each worth one of these. Valid totals are sums of exactly 7 values.
const KRILLION_ROUNDS = [0, 10, 15, 30, 60, 85, 100];
const krillionSums = (() => {
  let s = new Set([0]);
  for (let i = 0; i < 7; i++) s = new Set([...s].flatMap((t) => KRILLION_ROUNDS.map((r) => t + r)));
  return s;
})();

const up = (pairs: [number, number][]): Threshold[] => pairs.map(([limit, points]) => ({ limit, points }));

export const GAMES: GameAdapter[] = [
  guessGame('wordle', 'Wordle', 'grid-3x3', 'Guess the five-letter word in six tries.', 'https://www.nytimes.com/games/wordle/index.html', 6, [10, 9, 8, 6, 4, 2]),
  {
    id: 'connections', name: 'Connections', icon: 'link', direction: 'lower',
    description: 'Group sixteen words into four categories.', url: 'https://www.nytimes.com/games/connections',
    inputHint: 'Mistakes made, 0-3 (4 = failed)',
    // ASSUMPTION: brief gave no format. Input is mistakes 0-4; 4 mistakes ends the game (fail).
    validate: (raw) => (isInt(raw) && raw >= 0 && raw <= 4 ? { ok: true, success: raw < 4, value: raw } : bad('Enter mistakes 0-4')),
    format: (v, s) => (s ? `${v} mistake${v === 1 ? '' : 's'}` : 'Failed'),
    scoring: { threshold: [{ limit: 0, points: 10 }, { limit: 1, points: 8 }, { limit: 2, points: 6 }, { limit: 3, points: 4 }], floor: 1, failPoints: 0, maxPoints: 10, version: 1 },
  },
  guessGame('worldle', 'Worldle', 'globe', 'Identify the country from its silhouette.', 'https://worldle.teuteuf.fr', 5, [10, 8, 6, 4, 2]),
  {
    id: 'globle', name: 'Globle', icon: 'earth', direction: 'lower',
    description: 'Find the mystery country using distance hints.', url: 'https://globle-game.com',
    inputHint: 'Number of guesses (no limit)',
    validate: (raw) => (isInt(raw) && raw >= 1 ? { ok: true, success: true, value: raw } : bad('Enter a whole number, 1 or more')),
    format: (v) => `${v} guesses`,
    scoring: { threshold: up([[3, 10], [5, 8], [8, 6], [12, 4], [20, 2]]), floor: 1, failPoints: 0, maxPoints: 10, version: 1 },
  },
  guessGame('flagle', 'Flagle', 'flag', 'Guess the flag as it is revealed.', 'https://flagle.io', 6, [10, 9, 8, 6, 4, 2]),
  {
    id: 'chainle', name: 'Chainle', icon: 'link-2', direction: 'higher',
    description: 'Build word chains for points.', url: 'https://chainle.io',
    inputHint: 'Points, 0-5000',
    validate: (raw) => (isInt(raw) && raw >= 0 && raw <= 5000 ? { ok: true, success: true, value: raw } : bad('Enter 0-5000')),
    format: (v) => `${v}/5000`,
    scoring: { threshold: up([[4500, 10], [4000, 9], [3500, 8], [3000, 7], [2500, 6], [2000, 5], [1500, 4], [1000, 3], [500, 2]]), floor: 1, failPoints: 0, maxPoints: 10, version: 1 },
  },
  {
    id: 'angle', name: 'Angle', icon: 'triangle', direction: 'lower',
    description: 'Two parts, four attempts each.', url: 'https://angle.wtf',
    inputHint: 'Guesses for part 1 and part 2 (1-4 each, X if failed)',
    // ASSUMPTION: input {part1, part2}; value = sum of guesses, a failed part counts as 5.
    // Success only if both parts solved. Real Angle rules unverified.
    validate: (raw) => {
      const r = raw as { part1?: unknown; part2?: unknown } | null;
      if (!r || typeof r !== 'object') return bad('Enter both parts');
      const parts = [r.part1, r.part2].map((p) => {
        if (typeof p === 'string' && p.toUpperCase() === FAIL) return 5;
        return isInt(p) && p >= 1 && p <= 4 ? p : null;
      });
      if (parts.includes(null)) return bad('Each part must be 1-4 or X');
      const [a, b] = parts as number[];
      return { ok: true, success: a <= 4 && b <= 4, value: a + b };
    },
    format: (v, s) => (s ? `${v} total` : `Failed (${v})`),
    scoring: { threshold: up([[2, 10], [3, 9], [4, 8], [5, 6], [6, 5], [7, 3], [8, 2]]), floor: 1, failPoints: 0, maxPoints: 10, version: 1 },
  },
  {
    id: 'krillion', name: 'Krillion', icon: 'target', direction: 'higher',
    description: 'Seven rounds, up to 100 points each.', url: 'https://krillion.io',
    inputHint: 'Total score, 0-700',
    validate: (raw) => (isInt(raw) && krillionSums.has(raw) ? { ok: true, success: true, value: raw } : bad('Not a possible total: 7 rounds of 0, 10, 15, 30, 60, 85 or 100')),
    format: (v) => `${v}/700`,
    scoring: { threshold: up([[650, 10], [600, 9], [550, 8], [500, 7], [400, 6], [300, 5], [200, 4], [100, 3]]), floor: 1, failPoints: 0, maxPoints: 10, version: 1 },
  },
  {
    id: 'rooted', name: 'Rooted', icon: 'sprout', direction: 'higher',
    description: 'As many valid guesses as you can in a minute.', url: 'https://rootedgame.app',
    inputHint: 'Points (no maximum)',
    validate: (raw) => (isInt(raw) && raw >= 0 ? { ok: true, success: true, value: raw } : bad('Enter a whole number, 0 or more')),
    format: (v) => `${v} pts`,
    // PLACEHOLDER thresholds: uncapped game, real score distribution unknown. Tune via admin config.
    scoring: { threshold: up([[40, 10], [35, 9], [30, 8], [25, 7], [20, 6], [15, 5], [10, 4], [5, 3], [1, 2]]), floor: 1, failPoints: 0, maxPoints: 10, version: 1 },
  },
];

export const GAME_REGISTRY: ReadonlyMap<string, GameAdapter> = new Map(GAMES.map((g) => [g.id, g]));
export const getGame = (id: string) => GAME_REGISTRY.get(id);
