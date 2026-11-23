import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Security fixes (2026-11-23 audit):
//  1. TRUST_PROXY is now wired into Fastify, so rate limits key on the real
//     client IP behind Render instead of one shared proxy-IP bucket.
//  2. sendMail no longer logs the message body, so a password-reset token
//     never lands in stdout/logs when SMTP is unconfigured.
//  3. Invite codes can be revoked (DELETE /groups/:id/invites/:code).
//  4. Malformed member userIds return 404, not a 500 CastError.
// Runs against a throwaway in-memory Mongo, through the real HTTP routes.
describe('security fixes', () => {
  let mongod: MongoMemoryServer;
  let app: any;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-123456';
    process.env.MONGODB_URI = mongod.getUri();
    process.env.TRUST_PROXY = 'true';
    delete process.env.SIGNUP_CODE;
    delete process.env.SMTP_URL;
    const { build } = await import('../src/server.ts');
    await mongoose.connect(process.env.MONGODB_URI);
    app = await build();
  });

  after(async () => {
    await app?.close();
    await mongoose.disconnect();
    await mongod?.stop();
  });

  const auth = (userId: string) => ({ authorization: `Bearer ${app.jwt.sign({ sub: userId })}` });
  const mkUser = async (email: string, extra: Record<string, unknown> = {}) => {
    const r = await app.inject({ method: 'POST', url: '/auth/register', headers: { 'x-forwarded-for': '10.0.0.1' }, payload: { email, password: 'password123', displayName: 'T', ...extra } });
    assert.equal(r.statusCode, 201, r.body);
    return r.json().user;
  };

  it('register ignores role fields: no privilege escalation at signup', async () => {
    const u = await mkUser('role@test.local', { role: 'admin', isAdmin: true });
    assert.ok(!('role' in u) && !('isAdmin' in u));
    const r = await app.inject({ method: 'PATCH', url: '/users/me', headers: auth(u.id), payload: { displayName: 'T2', role: 'admin' } });
    assert.equal(r.statusCode, 200);
    assert.ok(!('role' in r.json()));
  });

  it('member role cannot be set to owner, and a malformed member id is 404 not 500', async () => {
    const owner = await mkUser('owner@test.local');
    const g = await app.inject({ method: 'POST', url: '/groups', headers: auth(owner.id), payload: { name: 'G' } });
    const gid = g.json()._id;
    const bad = await app.inject({ method: 'DELETE', url: `/groups/${gid}/members/not-an-objectid`, headers: auth(owner.id) });
    assert.equal(bad.statusCode, 404);
    const member = await mkUser('member@test.local');
    const inv = await app.inject({ method: 'POST', url: `/groups/${gid}/invites`, headers: auth(owner.id) });
    const joined = await app.inject({ method: 'POST', url: '/groups/join', headers: auth(member.id), payload: { code: inv.json().code } });
    assert.equal(joined.statusCode, 200);
    const esc = await app.inject({ method: 'PATCH', url: `/groups/${gid}/members/${member.id}`, headers: auth(owner.id), payload: { role: 'owner' } });
    assert.equal(esc.statusCode, 400); // zod enum is admin|member only
    const ok = await app.inject({ method: 'PATCH', url: `/groups/${gid}/members/${member.id}`, headers: auth(owner.id), payload: { role: 'admin' } });
    assert.equal(ok.statusCode, 200);
  });

  it('invite codes can be revoked, and a revoked code no longer admits anyone', async () => {
    const owner = await mkUser('rev-owner@test.local');
    const g = await app.inject({ method: 'POST', url: '/groups', headers: auth(owner.id), payload: { name: 'RG' } });
    const gid = g.json()._id;
    const member = await mkUser('rev-member@test.local');
    const inv = await app.inject({ method: 'POST', url: `/groups/${gid}/invites`, headers: auth(owner.id) });
    const code = inv.json().code as string;
    const notAdmin = await app.inject({ method: 'DELETE', url: `/groups/${gid}/invites/${code}`, headers: auth(member.id) });
    assert.equal(notAdmin.statusCode, 404); // not a member yet: group is hidden
    const joined = await app.inject({ method: 'POST', url: '/groups/join', headers: auth(member.id), payload: { code } });
    assert.equal(joined.statusCode, 200);
    const memberRevoke = await app.inject({ method: 'DELETE', url: `/groups/${gid}/invites/${code}`, headers: auth(member.id) });
    assert.equal(memberRevoke.statusCode, 403); // members cannot revoke
    const ghost = await app.inject({ method: 'DELETE', url: `/groups/${gid}/invites/deadbeef00`, headers: auth(owner.id) });
    assert.equal(ghost.statusCode, 404);
    const revoked = await app.inject({ method: 'DELETE', url: `/groups/${gid}/invites/${code}`, headers: auth(owner.id) });
    assert.equal(revoked.statusCode, 200);
    const late = await mkUser('rev-late@test.local');
    const denied = await app.inject({ method: 'POST', url: '/groups/join', headers: auth(late.id), payload: { code } });
    assert.equal(denied.statusCode, 404);
  });

  it('password-reset mail never logs the token when SMTP is unconfigured', async () => {
    const { sendMail } = await import('../src/mail.ts');
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => { lines.push(a.join(' ')); };
    try { await sendMail('someone@test.local', 'Reset your password', 'Reset link: https://x/#/reset?token=SECRET-TOKEN-123'); }
    finally { console.log = orig; }
    assert.ok(lines.length >= 1);
    assert.ok(!lines.join('\n').includes('SECRET-TOKEN-123'), 'reset token leaked into logs');
    assert.ok(lines.join('\n').includes('someone@test.local'));
  });

  it('rate limits key on the real client IP behind a proxy (TRUST_PROXY)', async () => {
    await mkUser('flood@test.local'); // registered via 10.0.0.1, separate bucket
    const attempt = (xff: string) =>
      app.inject({ method: 'POST', url: '/auth/login', headers: { 'x-forwarded-for': xff }, payload: { email: 'flood@test.local', password: 'wrong-password' } });
    for (let i = 0; i < 10; i++) assert.equal((await attempt('10.0.0.2')).statusCode, 401, `attempt ${i + 1} should be 401, not rate-limited`);
    assert.equal((await attempt('10.0.0.2')).statusCode, 429, '11th attempt from the same IP must be rate-limited');
    assert.equal((await attempt('10.0.0.3')).statusCode, 401, 'a different client IP must have its own bucket');
  });
});
