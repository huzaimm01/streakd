import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Friends-only signup gate: when SIGNUP_CODE is set, POST /auth/register
// needs the matching invite code; when unset, registration stays open.
// The code is read at request time, so these tests flip the env var between
// calls with no rebuild. The code used here is a dummy, never a real one.
// Runs against a throwaway in-memory Mongo, through the real HTTP routes.
describe('friends-only signup gate', () => {
  let mongod: MongoMemoryServer;
  let app: any;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-123456';
    process.env.MONGODB_URI = mongod.getUri();
    delete process.env.SIGNUP_CODE;
    const { build } = await import('../src/server.ts');
    await mongoose.connect(process.env.MONGODB_URI);
    app = await build();
  });

  after(async () => {
    await app?.close();
    await mongoose.disconnect();
    await mongod?.stop();
  });

  const register = (email: string, signupCode?: string) =>
    app.inject({ method: 'POST', url: '/auth/register', payload: { email, password: 'password123', displayName: 'Gate', ...(signupCode !== undefined ? { signupCode } : {}) } });
  const config = () => app.inject({ method: 'GET', url: '/config' });

  it('registers openly when SIGNUP_CODE is unset', async () => {
    delete process.env.SIGNUP_CODE;
    const c = await config();
    assert.equal(c.statusCode, 200);
    assert.equal(c.json().signupCodeRequired, false);
    const r = await register('open@test.local');
    assert.equal(r.statusCode, 201);
    assert.equal(r.json().user.email, 'open@test.local');
  });

  it('rejects registration without a code when SIGNUP_CODE is set', async () => {
    process.env.SIGNUP_CODE = 'TESTCODE123';
    const c = await config();
    assert.equal(c.statusCode, 200);
    assert.equal(c.json().signupCodeRequired, true);
    const r = await register('nocode@test.local');
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().error, 'Invite code required');
  });

  it('rejects a wrong code', async () => {
    const r = await register('wrong@test.local', 'NOTTHECODE');
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().error, 'Invite code required');
  });

  it('accepts the correct code', async () => {
    const r = await register('ok@test.local', 'TESTCODE123');
    assert.equal(r.statusCode, 201);
    assert.equal(r.json().user.email, 'ok@test.local');
  });

  it('login still works for an account created with a code', async () => {
    const r = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ok@test.local', password: 'password123' } });
    assert.equal(r.statusCode, 200);
    assert.ok(r.json().accessToken);
  });
});
