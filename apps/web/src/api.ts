const BASE: string = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
let token: string | null = null;

// The refresh token is also kept in localStorage, not only in the HttpOnly
// cookie: Safari blocks the cross-site cookie when the site and the API live
// on different domains, which logged users out on every reload. The cookie
// path still works where the browser allows it; localStorage is the fallback.
// Either way the server rotates the token on every refresh, so a stored
// token is single-use.
const RT_KEY = 'streakd-rt';
function getStoredRt(): string | null { try { return localStorage.getItem(RT_KEY); } catch { return null; } }
function setStoredRt(rt: string | null) { try { if (rt) localStorage.setItem(RT_KEY, rt); else localStorage.removeItem(RT_KEY); } catch {} }

// --- waking indicator ---
// The API runs on Render's free tier, so after 15 idle minutes it spins down
// and the next request takes ~a minute. Requests below retry in the
// background instead of failing, and the UI shows a "waking" pill while any
// request is still waiting, so the user can keep using the app.
type WakingListener = (waking: boolean) => void;
const wakingListeners = new Set<WakingListener>();
let waking = false, inflight = 0;
function setWaking(v: boolean) { if (v === waking) return; waking = v; wakingListeners.forEach((f) => f(v)); }
export function subscribeWaking(f: WakingListener) { wakingListeners.add(f); f(waking); return () => { wakingListeners.delete(f); }; }

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fire-and-forget wake-up ping. Opening the site hits /health so Render
// starts spinning the service up immediately, before login or any real
// request. It never throws and never retries: the real requests below have
// their own retry logic; this one only starts the spin-up as early as
// possible.
export function wake() {
  try { fetch(BASE + '/health', { signal: AbortSignal.timeout(10000) }).catch(() => {}); } catch {}
}

// --- outbox ---
// Results saved while the server is still waking are kept on the device and
// pushed when it answers. Submissions update in place (unique per
// group/user/game/date), so sending the same results twice is harmless —
// the second send just overwrites with the same values.
const OUTBOX_KEY = 'streakd-outbox';
type OutboxItem = { groupId: string; date: string; results: Record<string, string> };
function readOutbox(): OutboxItem[] { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]'); } catch { return []; } }
function writeOutbox(items: OutboxItem[]) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(items)); } catch {} }
export function queueSubmission(groupId: string, date: string, results: Record<string, string>) {
  const items = readOutbox(), i = items.findIndex((x) => x.groupId === groupId && x.date === date);
  if (i >= 0) items[i] = { groupId, date, results: { ...items[i].results, ...results } };
  else items.push({ groupId, date, results });
  writeOutbox(items);
}
export function dropSubmission(groupId: string, date: string) {
  writeOutbox(readOutbox().filter((x) => !(x.groupId === groupId && x.date === date)));
}
let flushing = false;
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  const items = readOutbox();
  if (!items.length) return;
  flushing = true;
  try {
    for (const item of items) {
      await api('PUT', `/groups/${item.groupId}/submissions`, { date: item.date, results: item.results });
      dropSubmission(item.groupId, item.date);
    }
  } catch { /* stays queued; retried on the next open */ } finally { flushing = false; }
}

const RETRY_DELAYS = [2000, 4000, 8000, 16000];
const ATTEMPT_TIMEOUT = 30000;

// One fetch attempt with a timeout, retried while the server is waking up.
// Network errors are only retried for methods that are safe to repeat
// (GET/PUT — submissions update in place); a 502/503/504 from Render's proxy
// means the request never reached the app, so any method is safe to repeat.
async function fetchRetry(method: string, path: string, headers: Record<string, string>, body?: string): Promise<Response> {
  let attempt = 0;
  inflight++;
  const slowTimer = setTimeout(() => setWaking(true), 4000);
  try {
    for (;;) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT);
      let r: Response;
      try {
        r = await fetch(BASE + path, { method, headers, credentials: 'include', body, signal: ctrl.signal });
      } catch (e) {
        clearTimeout(timer);
        if (attempt < RETRY_DELAYS.length && (method === 'GET' || method === 'PUT')) { setWaking(true); await sleep(RETRY_DELAYS[attempt++]); continue; }
        throw e;
      }
      clearTimeout(timer);
      if ((r.status === 502 || r.status === 503 || r.status === 504) && attempt < RETRY_DELAYS.length) { setWaking(true); await sleep(RETRY_DELAYS[attempt++]); continue; }
      return r;
    }
  } finally {
    inflight--;
    clearTimeout(slowTimer);
    if (inflight === 0) setWaking(false);
  }
}

export async function refresh(): Promise<boolean> {
  const stored = getStoredRt();
  const r = await fetchRetry('POST', '/auth/refresh', stored ? { 'Content-Type': 'application/json' } : {}, stored ? JSON.stringify({ refreshToken: stored }) : undefined);
  if (!r.ok) { token = null; setStoredRt(null); return false; }
  const j = await r.json();
  token = j.accessToken; setStoredRt(j.refreshToken ?? null); return true;
}
export function setToken(t: string | null, rt?: string | null) { token = t; if (rt !== undefined) setStoredRt(rt); if (t === null) setStoredRt(null); }

async function send(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetchRetry(method, path, headers, body === undefined ? undefined : JSON.stringify(body));
}
export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let r = await send(method, path, body);
  if (r.status === 401 && !path.startsWith('/auth/') && (await refresh())) r = await send(method, path, body);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.details?.join(', ') || j.error || 'Request failed');
  return j;
}
