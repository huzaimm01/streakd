import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { dateInTz } from '@streakd/core';

// Cross-group sync: logging a result in one group also lands it in your other
// groups that play the same game, so nobody logs the same Wordle twice.
// Runs against a throwaway in-memory Mongo, through the real HTTP routes.
describe('cross-group result sync', () => {
  let mongod: MongoMemoryServer;
  let app: any;
  let token: string;
  let userId: string;
  let A: any, B: any, C: any, D: any, E: any;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-123456';
    process.env.MONGODB_URI = mongod.getUri();
    const { build } = await import('../src/server.ts');
    const models = await import('../src/models.ts');
    await mongoose.connect(process.env.MONGODB_URI);
    app = await build();
    const u = await models.User.create({ email: 'sync@test.local', displayName: 'Sync', passwordHash: 'x' });
    userId = String(u._id);
    token = app.jwt.sign({ sub: userId });
    const mk = async (name: string, timezone: string, games: any[]) => {
      const g = await models.Group.create({ name, ownerId: userId, timezone, games, customCounter: 1 });
      await models.Membership.create({ groupId: g._id, userId, role: 'owner' });
      return g;
    };
    // A: Toronto, wordle + connections + a custom game. B: same catalog games. C: wordle off. D: Kiritimati (UTC+14). E: Baker Island (UTC-12, always one calendar day behind D).
    A = await mk('A', 'America/Toronto', [{ gameId: 'wordle', active: true }, { gameId: 'connections', active: true }, { gameId: 'custom:1', active: true, custom: true, name: 'Mine', inputHint: '' }]);
    B = await mk('B', 'America/Toronto', [{ gameId: 'wordle', active: true }, { gameId: 'connections', active: true }, { gameId: 'custom:1', active: true, custom: true, name: 'Other', inputHint: '' }]);
    C = await mk('C', 'America/Toronto', [{ gameId: 'wordle', active: false }, { gameId: 'connections', active: true }]);
    D = await mk('D', 'Pacific/Kiritimati', [{ gameId: 'wordle', active: true }, { gameId: 'connections', active: true }]);
    E = await mk('E', 'Etc/GMT+12', [{ gameId: 'wordle', active: true }, { gameId: 'connections', active: true }]);
  });

  after(async () => {
    await app?.close();
    await mongoose.disconnect();
    await mongod?.stop();
  });

  const put = (groupId: string, results: Record<string, string>, date?: string) =>
    app.inject({ method: 'PUT', url: `/groups/${groupId}/submissions`, headers: { authorization: `Bearer ${token}` }, payload: { ...(date ? { date } : {}), results } });
  const subs = async (groupId: string) => {
    const { Submission } = await import('../src/models.ts');
    return Submission.find({ groupId, userId }).lean();
  };

  it('syncs a catalog result to the groups that play it, and not to the ones that do not', async () => {
    const today = dateInTz(Date.now(), 'America/Toronto');
    const r = await put(String(A._id), { wordle: '4', connections: '2' }, today);
    assert.equal(r.statusCode, 200);
    const body = r.json();
    assert.deepEqual(Object.keys(body.saved).sort(), ['connections', 'wordle']);
    // B and C share Toronto's date, so they always sync. D and E sit a day either side of it, so their outcome follows the clock.
    const syncedNames = body.synced.map((s: any) => s.name);
    assert.ok(syncedNames.includes('B') && syncedNames.includes('C'));
    const b = await subs(String(B._id));
    assert.equal(b.length, 2);
    assert.equal(b.find((s: any) => s.gameId === 'wordle')?.raw, '4');
    assert.equal(b.find((s: any) => s.gameId === 'wordle')?.points, (await subs(String(A._id))).find((s: any) => s.gameId === 'wordle')?.points);
    const c = await subs(String(C._id));
    assert.equal(c.length, 1);
    assert.equal(c[0].gameId, 'connections'); // wordle is off in C, so only connections synced there
    for (const [name, gid, tz] of [['D', D, 'Pacific/Kiritimati'], ['E', E, 'Etc/GMT+12']] as const) {
      const there = dateInTz(Date.now(), tz), rows = await subs(String(gid._id));
      if (there < today) {
        assert.equal(rows.length, 0, `${name} is still on an earlier day, so the date is in the future there`);
        assert.ok(body.skipped.some((s: any) => s.name === name));
      } else {
        assert.equal(rows.length, 2);
        assert.ok(!body.skipped.some((s: any) => s.name === name));
      }
    }
  });

  it('never writes a future date: Kiritimati today is always tomorrow on Baker Island', async () => {
    const dToday = dateInTz(Date.now(), 'Pacific/Kiritimati');
    const r = await put(String(D._id), { wordle: '3' }, dToday);
    assert.equal(r.statusCode, 200);
    assert.ok(!r.json().synced.some((s: any) => s.name === 'E'));
    assert.ok(r.json().skipped.some((s: any) => s.name === 'E' && s.reason === 'date is in the future there'));
    assert.equal((await subs(String(E._id))).filter((s: any) => s.gameId === 'wordle' && s.raw === '3').length, 0);
  });

  it('does not sync custom games', async () => {
    const today = dateInTz(Date.now(), 'America/Toronto');
    const before = (await subs(String(B._id))).length;
    const r = await put(String(A._id), { 'custom:1': '42' }, today);
    assert.equal(r.statusCode, 200);
    assert.equal((await subs(String(B._id))).length, before, 'a custom game in A is a different game in B');
  });

  it('syncs a clear, and the home list stops showing the game as pending', async () => {
    const today = dateInTz(Date.now(), 'America/Toronto');
    await put(String(A._id), { wordle: '' }, today);
    assert.equal((await subs(String(B._id))).filter((s: any) => s.gameId === 'wordle').length, 0);
    const list = await app.inject({ method: 'GET', url: '/groups', headers: { authorization: `Bearer ${token}` } });
    assert.equal(list.statusCode, 200);
    const ga = list.json().find((g: any) => g.name === 'A');
    assert.ok(ga.pendingToday.includes('wordle'), 'cleared wordle is pending again');
    assert.ok(ga.memberNames.includes('Sync') && ga.memberCount === 1);
  });
});
