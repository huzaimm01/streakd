import test from 'node:test';
import assert from 'node:assert/strict';
import { getGame, GAMES, score, computeStreaks, dateInTz, addDays, standingsForMonth, rankChanges } from '../src/index.ts';

const g = (id: string) => getGame(id)!;

test('registry has all nine preset games', () => {
  assert.deepEqual(GAMES.map((x) => x.id), ['wordle', 'connections', 'worldle', 'globle', 'flagle', 'chainle', 'angle', 'krillion', 'rooted']);
});

test('wordle validation', () => {
  assert.equal(g('wordle').validate(4).ok, true);
  assert.equal(g('wordle').validate('x').ok && (g('wordle').validate('x') as any).success, false);
  assert.equal(g('wordle').validate(7).ok, false);
  assert.equal(g('wordle').validate(0).ok, false);
  assert.equal(g('worldle').validate(6).ok, false);
});

test('krillion accepts only reachable totals', () => {
  assert.equal(g('krillion').validate(99).ok, false);
  assert.equal(g('krillion').validate(700).ok, true);
  assert.equal(g('krillion').validate(0).ok, true);
  assert.equal(g('krillion').validate(701).ok, false);
  assert.equal(g('krillion').validate(15).ok, true);
  assert.equal(g('krillion').validate(5).ok, false);
});

test('angle and connections rules', () => {
  const a = g('angle').validate({ part1: 2, part2: 'X' });
  assert.ok(a.ok && !a.success && a.value === 7);
  assert.equal(g('angle').validate({ part1: 5, part2: 1 }).ok, false);
  const c = g('connections').validate(4);
  assert.ok(c.ok && !c.success);
});

test('scoring direction and failure', () => {
  const w = g('wordle');
  assert.equal(score(w, true, 1), 10);
  assert.ok(score(w, true, 3) > score(w, true, 5));
  assert.equal(score(w, false, 7), 0);
  assert.equal(score(g('krillion'), true, 700), 10);
  assert.equal(score(g('krillion'), true, 50), 1);
  assert.equal(score(g('rooted'), true, 500), 10);
  assert.equal(score(g('globle'), true, 100), 1);
});

test('streaks: consecutive, gaps, grace for today', () => {
  const r = computeStreaks(['2026-11-10', '2026-11-11', '2026-11-13', '2026-11-14', '2026-11-15'], '2026-11-16');
  assert.deepEqual(r, { current: 3, longest: 3, total: 5 });
  assert.equal(computeStreaks(['2026-11-10'], '2026-11-16').current, 0);
  assert.equal(computeStreaks(['2026-11-16'], '2026-11-16').current, 1);
  assert.equal(computeStreaks([], '2026-11-16').longest, 0);
});

test('timezone boundary uses group timezone', () => {
  const t = new Date('2026-11-16T03:30:00Z');
  assert.equal(dateInTz(t, 'UTC'), '2026-11-16');
  assert.equal(dateInTz(t, 'America/Toronto'), '2026-11-15');
  assert.equal(dateInTz(new Date('2026-03-08T06:59:00Z'), 'America/Toronto'), '2026-03-08');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('championship totals, month filter, tiebreakers', () => {
  const s = (userId: string, gameId: string, date: string, points: number, submittedAt: number) => ({ userId, gameId, date, points, submittedAt });
  const subs = [
    s('a', 'wordle', '2026-11-01', 10, 1), s('a', 'globle', '2026-11-01', 6, 2),
    s('b', 'wordle', '2026-11-01', 8, 3), s('b', 'globle', '2026-11-01', 8, 4),
    s('c', 'wordle', '2026-10-31', 10, 0),
    s('d', 'wordle', '2026-11-02', 8, 5), s('d', 'globle', '2026-11-02', 8, 6),
  ];
  const st = standingsForMonth(subs, '2026-11');
  assert.equal(st.find((x) => x.userId === 'c'), undefined);
  assert.deepEqual(st.map((x) => x.userId), ['a', 'b', 'd']); // a: more top scores; b beats d by reaching 16 earlier
  assert.deepEqual(st.map((x) => x.rank), [1, 2, 3]);
  const prev = standingsForMonth(subs.filter((x) => !(x.userId === 'a' && x.gameId === 'globle')), '2026-11');
  assert.equal(rankChanges(prev, st)['a'], 2);
  assert.equal(rankChanges(prev, st)['b'], -1);
});
