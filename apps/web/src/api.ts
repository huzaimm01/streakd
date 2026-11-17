const BASE: string = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
let token: string | null = null;

export async function refresh(): Promise<boolean> {
  const r = await fetch(BASE + '/auth/refresh', { method: 'POST', credentials: 'include' });
  if (!r.ok) { token = null; return false; }
  token = (await r.json()).accessToken; return true;
}
export function setToken(t: string | null) { token = t; }

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
