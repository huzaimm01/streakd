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

export async function refresh(): Promise<boolean> {
  const stored = getStoredRt();
  const r = await fetch(BASE + '/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: stored ? { 'Content-Type': 'application/json' } : {},
    body: stored ? JSON.stringify({ refreshToken: stored }) : undefined,
  });
  if (!r.ok) { token = null; setStoredRt(null); return false; }
  const j = await r.json();
  token = j.accessToken; setStoredRt(j.refreshToken ?? null); return true;
}
export function setToken(t: string | null, rt?: string | null) { token = t; if (rt !== undefined) setStoredRt(rt); if (t === null) setStoredRt(null); }

async function send(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(BASE + path, { method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body) });
}
export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let r = await send(method, path, body);
  if (r.status === 401 && !path.startsWith('/auth/') && (await refresh())) r = await send(method, path, body);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.details?.join(', ') || j.error || 'Request failed');
  return j;
}
