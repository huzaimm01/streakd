import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { z, ZodError } from 'zod';
import { GAMES, getGame, score, computeStreaks, dateInTz, addDays, standingsForMonth } from '@streakd/core';
import { cfg } from './config.ts';
import { sendMail } from './mail.ts';
import { User, RefreshToken, PasswordReset, Group, Membership, Invitation, Submission, Championship } from './models.ts';

type Role = 'owner' | 'admin' | 'member';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const uid = (req: FastifyRequest) => (req.user as { sub: string }).sub;
class HttpError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }
const fail = (s: number, m: string): never => { throw new HttpError(s, m); };
const strictLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

export async function build() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: cfg.cors, credentials: true });
  await app.register(cookie);
  await app.register(jwt, { secret: cfg.jwtSecret, sign: { expiresIn: cfg.accessTtl } });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'Invalid input', details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  const auth = async (req: FastifyRequest, reply: FastifyReply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'Unauthorized' }); }
  };
  const A = { onRequest: [auth] };

  /** Every group route goes through this: caller must be a member (and have `min` role). Prevents cross-group access. */
  async function member(req: FastifyRequest, min: Role = 'member') {
    const { groupId } = req.params as { groupId: string };
    if (!/^[a-f\d]{24}$/i.test(groupId)) fail(404, 'Group not found');
    const m = await Membership.findOne({ groupId, userId: uid(req) });
    if (!m) fail(404, 'Group not found'); // 404, not 403: don't reveal that the group exists
    const rank = { member: 0, admin: 1, owner: 2 };
    if (rank[m!.role as Role] < rank[min]) fail(403, 'Insufficient permissions');
    const group = (await Group.findById(groupId))!;
    return { m: m!, group, groupId };
  }

  // Refresh tokens live in two places: the HttpOnly `rt` cookie (browsers that
  // allow cross-site cookies) and, for browsers that block those (e.g. Safari
  // with the site on one domain and the API on another), the response body,
  // which the web app keeps in localStorage and sends back in the request
  // body. Either way the server only ever stores the SHA-256 hash.
  function refreshTokenFrom(req: FastifyRequest): string | undefined {
    const fromBody = (req.body as any)?.refreshToken;
    const fromHeader = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    return [(req.cookies as any).rt as string | undefined, fromHeader, typeof fromBody === 'string' ? fromBody : undefined]
      .find((x): x is string => typeof x === 'string' && x.length > 0);
  }

  async function session(reply: FastifyReply, userId: string) {
    const token = randomBytes(32).toString('hex');
    await RefreshToken.create({ userId, tokenHash: sha(token), expiresAt: new Date(Date.now() + cfg.refreshDays * 864e5) });
    reply.setCookie('rt', token, { httpOnly: true, secure: cfg.secure || cfg.sameSite === 'none', sameSite: cfg.sameSite, path: '/auth', maxAge: cfg.refreshDays * 86400 });
    return { accessToken: app.jwt.sign({ sub: userId }), refreshToken: token };
  }
  const publicUser = (u: any) => ({ id: u._id, email: u.email, displayName: u.displayName });

  app.get('/health', async () => ({ ok: true }));

  // ---------- Auth ----------
  const creds = z.object({ email: z.string().email().max(120), password: z.string().min(8).max(100) });
  app.post('/auth/register', strictLimit, async (req, reply) => {
    const b = creds.extend({ displayName: z.string().trim().min(1).max(40) }).parse(req.body);
    if (await User.exists({ email: b.email.toLowerCase() })) fail(409, 'Email already registered');
    const u = await User.create({ email: b.email, displayName: b.displayName, passwordHash: await bcrypt.hash(b.password, 12) });
    return reply.code(201).send({ user: publicUser(u), ...(await session(reply, String(u._id))) });
  });
  app.post('/auth/login', strictLimit, async (req, reply) => {
    const b = creds.parse(req.body);
    const u = await User.findOne({ email: b.email.toLowerCase() });
    const ok = u ? await bcrypt.compare(b.password, u.passwordHash) : false;
    if (!u || !ok) fail(401, 'Invalid email or password');
    return { user: publicUser(u), ...(await session(reply, String(u!._id))) };
  });
  app.post('/auth/refresh', strictLimit, async (req, reply) => {
    const t = refreshTokenFrom(req);
    const row = t ? await RefreshToken.findOneAndDelete({ tokenHash: sha(t) }) : null; // rotation: old token is single-use
    if (!row || row.expiresAt < new Date()) fail(401, 'Session expired');
    return session(reply, String(row!.userId));
  });
  app.post('/auth/logout', async (req, reply) => {
    const t = refreshTokenFrom(req);
    if (t) await RefreshToken.deleteOne({ tokenHash: sha(t) });
    reply.clearCookie('rt', { path: '/auth' });
    return { ok: true };
  });
  app.get('/users/me', A, async (req) => publicUser(await User.findById(uid(req)) ?? fail(401, 'Unauthorized')));
  app.patch('/users/me', A, async (req) => {
    const b = z.object({ displayName: z.string().trim().min(1).max(40) }).parse(req.body);
    return publicUser(await User.findByIdAndUpdate(uid(req), b, { new: true }));
  });

  app.post('/auth/forgot', strictLimit, async (req) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const u = await User.findOne({ email: email.toLowerCase() });
    if (u) {
      const t = randomBytes(32).toString('hex');
      await PasswordReset.create({ userId: u._id, tokenHash: sha(t), expiresAt: new Date(Date.now() + 36e5) });
      await sendMail(u.email, 'Reset your Streak’d password', `Reset your password (link valid for 1 hour):\n${cfg.appUrl}/#/reset?token=${t}`);
    }
    return { ok: true }; // same answer whether or not the email exists
  });
  app.post('/auth/reset', strictLimit, async (req) => {
    const b = z.object({ token: z.string().min(20).max(100), password: z.string().min(8).max(100) }).parse(req.body);
    const row = await PasswordReset.findOneAndDelete({ tokenHash: sha(b.token) }); // single use
    if (!row || row.expiresAt < new Date()) fail(400, 'Reset link is invalid or expired');
    await User.updateOne({ _id: row!.userId }, { passwordHash: await bcrypt.hash(b.password, 12) });
    await RefreshToken.deleteMany({ userId: row!.userId }); // sign out every session
    return { ok: true };
  });

  // ---------- Games ----------
  app.get('/games', A, async () => GAMES.map(({ id, name, icon, description, direction, inputHint }) => ({ id, name, icon, description, direction, inputHint })));

  // ---------- Groups ----------
  const tz = z.string().refine((s) => { try { dateInTz(0, s); return true; } catch { return false; } }, 'Unknown timezone');
  const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
  app.post('/groups', A, async (req, reply) => {
    const b = z.object({ name: z.string().trim().min(1).max(60), description: z.string().max(300).optional(), timezone: tz.optional(), mainColor: hex.optional(), accentColor: hex.optional() }).parse(req.body);
    const g = await Group.create({ ...b, ownerId: uid(req), games: GAMES.map((x) => ({ gameId: x.id })) });
    await Membership.create({ groupId: g._id, userId: uid(req), role: 'owner' });
    return reply.code(201).send(g);
  });
  app.get('/groups', A, async (req) => {
    const ms = await Membership.find({ userId: uid(req) }).lean();
    const groups = await Group.find({ _id: { $in: ms.map((m) => m.groupId) } }).lean();
    return groups.map((g) => ({ ...g, role: ms.find((m) => String(m.groupId) === String(g._id))!.role }));
  });
  app.get('/groups/:groupId', A, async (req) => {
    const { group, m, groupId } = await member(req);
    const ms = await Membership.find({ groupId }).lean();
    const users = await User.find({ _id: { $in: ms.map((x) => x.userId) } }).select('displayName').lean();
    return { ...group.toObject(), role: m.role, members: ms.map((x) => ({ userId: x.userId, role: x.role, displayName: users.find((u) => String(u._id) === String(x.userId))?.displayName })) };
  });
  app.patch('/groups/:groupId', A, async (req) => {
    const { group } = await member(req, 'admin');
    const b = z.object({ name: z.string().trim().min(1).max(60), description: z.string().max(300), timezone: tz, mainColor: hex, accentColor: hex }).partial().parse(req.body);
    Object.assign(group, b); return group.save();
  });
  app.delete('/groups/:groupId', A, async (req) => {
    const { groupId } = await member(req, 'owner');
    await Promise.all([Submission, Membership, Invitation, Championship].map((M: any) => M.deleteMany({ groupId })));
    await Group.deleteOne({ _id: groupId }); return { ok: true };
  });
  app.post('/groups/:groupId/leave', A, async (req) => {
    const { m } = await member(req);
    if (m.role === 'owner') fail(400, 'Transfer ownership before leaving');
    await m.deleteOne(); return { ok: true };
  });

  // ---------- Invitations & membership ----------
  app.post('/groups/:groupId/invites', A, async (req, reply) => {
    const { groupId } = await member(req, 'admin');
    const inv = await Invitation.create({ groupId, code: randomBytes(5).toString('hex'), createdBy: uid(req), expiresAt: new Date(Date.now() + 7 * 864e5) });
    return reply.code(201).send({ code: inv.code, expiresAt: inv.expiresAt });
  });
  app.post('/groups/join', { ...A, ...strictLimit }, async (req) => {
    const { code } = z.object({ code: z.string().min(4).max(40) }).parse(req.body);
    const inv = await Invitation.findOne({ code, revoked: false });
    if (!inv || (inv.expiresAt && inv.expiresAt < new Date())) fail(404, 'Invalid or expired invite');
    await Membership.updateOne({ groupId: inv!.groupId, userId: uid(req) }, { $setOnInsert: { role: 'member' } }, { upsert: true });
    return { groupId: inv!.groupId };
  });
  app.delete('/groups/:groupId/members/:userId', A, async (req) => {
    const { m, groupId } = await member(req, 'admin');
    const target = await Membership.findOne({ groupId, userId: (req.params as any).userId });
    if (!target) fail(404, 'Member not found');
    if (target!.role === 'owner' || (target!.role === 'admin' && m.role !== 'owner')) fail(403, 'Insufficient permissions');
    await target!.deleteOne(); return { ok: true };
  });
  app.patch('/groups/:groupId/members/:userId', A, async (req) => {
    const { groupId } = await member(req, 'owner');
    const { role } = z.object({ role: z.enum(['admin', 'member']) }).parse(req.body);
    const t = await Membership.findOne({ groupId, userId: (req.params as any).userId });
    if (!t || t.role === 'owner') fail(404, 'Member not found');
    t!.role = role; await t!.save(); return { ok: true };
  });
  app.post('/groups/:groupId/transfer', A, async (req) => {
    const { m, group, groupId } = await member(req, 'owner');
    const { userId } = z.object({ userId: z.string() }).parse(req.body);
    const t = await Membership.findOne({ groupId, userId });
    if (!t) fail(404, 'Member not found');
    t!.role = 'owner'; m.role = 'admin'; group.ownerId = t!.userId as any;
    await Promise.all([t!.save(), m.save(), group.save()]); return { ok: true };
  });

  // ---------- Group games ----------
  const activeCount = (g: any) => g.games.filter((x: any) => x.active).length;
  app.patch('/groups/:groupId/games', A, async (req) => {
    const { group } = await member(req, 'admin');
    const b = z.object({ gameId: z.string(), active: z.boolean() }).parse(req.body);
    const gs = group.games.find((x) => x.gameId === b.gameId) ?? (getGame(b.gameId) ? group.games[group.games.push({ gameId: b.gameId, active: false, custom: false } as any) - 1] : fail(404, 'Unknown game'));
    gs!.active = b.active;
    if (activeCount(group) < 2) fail(400, 'A group needs at least two enabled games');
    return group.save(); // disabling archives the game; submissions are never deleted
  });
  app.post('/groups/:groupId/games/custom', A, async (req, reply) => {
    const { group } = await member(req, 'admin');
    const b = z.object({ name: z.string().trim().min(1).max(40), description: z.string().max(200).default(''), inputHint: z.string().max(80).default('') }).parse(req.body);
    group.customCounter += 1;
    group.games.push({ gameId: `custom:${group.customCounter}`, active: true, custom: true, ...b } as any);
    return reply.code(201).send(await group.save());
  });

  // ---------- Submissions ----------
  function normalize(gameId: string, raw: unknown): unknown {
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (gameId === 'angle') { const p = t.split(/[\s,]+/); return p.length === 2 ? { part1: /^\d+$/.test(p[0]) ? +p[0] : p[0], part2: /^\d+$/.test(p[1]) ? +p[1] : p[1] } : t; }
      return /^\d+$/.test(t) ? Number(t) : t;
    }
    return raw;
  }
  app.put('/groups/:groupId/submissions', A, async (req) => {
    const { group, groupId } = await member(req);
    const b = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), results: z.record(z.union([z.string().max(100), z.number()])) }).parse(req.body);
    const today = dateInTz(Date.now(), group.timezone);       // group timezone decides "today"
    const date = b.date ?? today;
    if (date > today) fail(400, 'Cannot submit for a future date');
    const saved: Record<string, unknown> = {}, errors: Record<string, string> = {};
    for (const [gameId, rawIn] of Object.entries(b.results)) {
      const gs = group.games.find((x) => x.gameId === gameId);
      if (!gs || !gs.active) { errors[gameId] = 'Game is not enabled in this group'; continue; }
      const text = String(typeof rawIn === 'string' ? rawIn : rawIn).trim();
      if (!text) { await Submission.deleteOne({ groupId, userId: uid(req), gameId, date }); continue; } // blank clears a result
      let doc: { raw: string; value?: number; success: boolean; points: number | null };
      if (gs.custom) doc = { raw: text, success: true, points: null };
      else {
        const game = getGame(gameId)!, r = game.validate(normalize(gameId, rawIn));
        if (!r.ok) { errors[gameId] = r.error; continue; }
        doc = { raw: text, value: r.value, success: r.success, points: score(game, r.success, r.value) };
      }
      saved[gameId] = await Submission.findOneAndUpdate({ groupId, userId: uid(req), gameId, date }, { $set: { ...doc, scoringVersion: 1 } }, { upsert: true, new: true }); // unique key => update, never duplicate
    }
    return { date, saved, errors };
  });
  app.get('/groups/:groupId/submissions', A, async (req) => {
    const { groupId } = await member(req);
    const q = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    const filter: any = { groupId, userId: uid(req), ...(q.date ? { date: q.date } : {}) };
    const [items, total] = await Promise.all([Submission.find(filter).sort({ date: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), Submission.countDocuments(filter)]);
    return { items, total, page: q.page, limit: q.limit };
  });

  // ---------- Streaks (derived from submissions, never cached) ----------
  app.get('/groups/:groupId/streaks', A, async (req) => {
    const { group, groupId } = await member(req);
    const today = dateInTz(Date.now(), group.timezone);
    const active = new Set(group.games.filter((x) => x.active).map((x) => x.gameId));
    const subs = (await Submission.find({ groupId }).select('userId gameId date').lean()).filter((s) => active.has(s.gameId));
    const me = uid(req), perGame: Record<string, any> = {};
    for (const gameId of active) perGame[gameId] = {
      group: computeStreaks(subs.filter((s) => s.gameId === gameId).map((s) => s.date), today),
      you: computeStreaks(subs.filter((s) => s.gameId === gameId && String(s.userId) === me).map((s) => s.date), today),
    };
    return { today, overall: computeStreaks(subs.map((s) => s.date), today), perGame };
  });

  // ---------- Activity heatmap (last 53 weeks, per day: your results, everyone's results, distinct players) ----------
  app.get('/groups/:groupId/activity', A, async (req) => {
    const { group, groupId } = await member(req);
    const today = dateInTz(Date.now(), group.timezone);
    const since = addDays(today, -371);
    const active = new Set(group.games.filter((x) => x.active).map((x) => x.gameId));
    const rows = (await Submission.find({ groupId, date: { $gte: since } }).select('userId gameId date').lean()).filter((s) => active.has(s.gameId));
    const me = uid(req), days: Record<string, { you: number; group: number; players: number }> = {}, seen: Record<string, Set<string>> = {};
    for (const r of rows) {
      const d = (days[r.date] ??= { you: 0, group: 0, players: 0 }), u = String(r.userId);
      d.group++; if (u === me) d.you++;
      (seen[r.date] ??= new Set()).add(u); d.players = seen[r.date].size;
    }
    return { today, since, members: await Membership.countDocuments({ groupId }), days };
  });

  // ---------- Championships ----------
  const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
  async function standings(groupId: string, m: string) {
    const rows = await Submission.find({ groupId, date: { $regex: `^${m}-` }, points: { $ne: null } }).lean();
    const list = standingsForMonth(rows.map((r) => ({ userId: String(r.userId), gameId: r.gameId, date: r.date, points: r.points as number, submittedAt: new Date((r as any).updatedAt).getTime() })), m);
    const users = await User.find({ _id: { $in: list.map((s) => s.userId) } }).select('displayName').lean();
    return list.map((s) => ({ ...s, displayName: users.find((u) => String(u._id) === s.userId)?.displayName ?? 'Former member' }));
  }
  app.get('/groups/:groupId/championships', A, async (req) => {
    const { groupId } = await member(req);
    return Championship.find({ groupId }).sort({ month: -1 }).lean();
  });
  app.get('/groups/:groupId/championships/:month', A, async (req) => {
    const { group, groupId } = await member(req);
    const m = month.parse((req.params as any).month);
    const current = dateInTz(Date.now(), group.timezone).slice(0, 7);
    if (m >= current) return { month: m, final: false, standings: await standings(groupId, m) };
    // Completed months are archived once, with the scoring version used, and then read back unchanged.
    let arch = await Championship.findOne({ groupId, month: m });
    if (!arch) {
      const st = await standings(groupId, m);
      arch = await Championship.findOneAndUpdate({ groupId, month: m }, { $setOnInsert: { standings: st, championId: st[0]?.userId ?? null, scoringVersion: 1 } }, { upsert: true, new: true });
    }
    return { month: m, final: true, championId: arch!.championId, scoringVersion: arch!.scoringVersion, standings: arch!.standings };
  });

  return app;
}
