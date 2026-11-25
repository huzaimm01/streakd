import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ambient } from './Ambient';
import { Auth } from './Auth';
import { api, flushOutbox, refresh, setToken, subscribeWaking, wake } from './api';
import { applyPalette, defaultPalette, palette } from './color';
import { GroupView } from './Group';
import { Home } from './Home';
import { AccountSheet, AddGroupSheet, HomeSubmitSheet } from './Sheets';
import { ToastProvider, useMedia, useToast } from './ui';
import type { CatalogGame, Group, Mode, Theme, User } from './types';

/** Tiny hash router: "#/g/<id>" is a group, anything else is home. Browser back/forward just work. */
const parse = () => location.hash.match(/^#\/g\/([a-f\d]{24})/i)?.[1] ?? null;
function useRoute() {
  // Opening the app always lands on the dashboard: the tab's URL may still
  // carry last session's #/g/<id>, and that must not reopen the group.
  const [gid, setGid] = useState<string | null>(null);
  useEffect(() => {
    const f = () => setGid(parse());
    addEventListener('hashchange', f);
    if (parse()) location.hash = '#/';
    return () => removeEventListener('hashchange', f);
  }, []);
  return [gid, (id: string | null) => { location.hash = id ? `#/g/${id}` : '#/'; }] as const;
}

function Shell({ user, setUser, logout }: { user: User; setUser: (u: User) => void; logout: () => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null), [cat, setCat] = useState<CatalogGame[]>([]), [detail, setDetail] = useState<Group | null>(null);
  const [streaks, setStreaks] = useState<Record<string, number>>({}), [gid, go] = useRoute(), toast = useToast();
  const [theme, setTheme] = useState<Theme>((localStorage.getItem('theme') as Theme) || 'dark');
  const [account, setAccount] = useState(false), [add, setAdd] = useState<null | 'create' | 'join'>(null), [addTab, setAddTab] = useState<'create' | 'join'>('create');
  const [logScores, setLogScores] = useState(false);
  const [waking, setWaking] = useState(false);
  useEffect(() => subscribeWaking(setWaking), []);
  const dark = !useMedia('(prefers-color-scheme: light)'), mode: Mode = theme === 'system' ? (dark ? 'dark' : 'light') : theme;

  const loadGroups = useCallback(async () => {
    const gs: Group[] = await api('GET', '/groups'); setGroups(gs);
    Promise.allSettled(gs.map((g) => api('GET', `/groups/${g._id}/streaks`).then((s) => [g._id, s.overall.current] as const)))
      .then((r) => setStreaks(Object.fromEntries(r.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : [])))));
    return gs;
  }, []);
  const loadDetail = useCallback(async (id: string) => { const d = await api('GET', `/groups/${id}`); setDetail(d); return d; }, []);
  useEffect(() => { loadGroups().catch((e) => toast(e.message, 'err')); api('GET', '/games').then(setCat).catch(() => {}); }, []);
  useEffect(() => { setDetail(null); if (gid) loadDetail(gid).catch(() => { toast('Group not found', 'err'); go(null); }); }, [gid]);
  useEffect(() => { localStorage.setItem('theme', theme); }, [theme]);

  const g = gid ? (detail?._id === gid ? detail : groups?.find((x) => x._id === gid) ?? null) : null;
  const pal = useMemo(() => (g ? palette(g.mainColor, g.accentColor, mode) : defaultPalette(mode)), [g?.mainColor, g?.accentColor, mode, !!g]);
  const orbs = g ? pal.orbs : groups?.length ? groups.flatMap((x) => palette(x.mainColor, x.accentColor, mode).orbs.slice(0, 2)) : pal.orbs;
  useEffect(() => applyPalette(pal, mode), [pal, mode]);

  const afterChange = async () => { const gs = await loadGroups(); if (gid) await loadDetail(gid); return gs; };
  const open = (id: string | null) => { go(id); scrollTo({ top: 0 }); };

  return <>
    {waking && <div className="wake-pill" role="status">Waking the server…</div>}
    <Ambient bg={pal.bg} orbs={orbs} />
    <AnimatePresence mode="wait" initial={false}>
      {g ? <motion.div key={'g' + g._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
        <GroupView g={g} cat={cat} me={user.id} theme={theme} setTheme={setTheme} back={() => open(null)} reload={afterChange} openAccount={() => setAccount(true)}
          onLeft={async () => { open(null); await loadGroups(); }} />
      </motion.div>
        : <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <Home user={user} groups={groups} cat={cat} streaks={streaks} theme={theme} setTheme={setTheme} onOpen={open} onAccount={() => setAccount(true)} onLogout={logout}
            onAdd={(t) => { setAddTab(t); setAdd(t); }} onLogScores={() => setLogScores(true)} />
        </motion.div>}
    </AnimatePresence>
    <AccountSheet user={user} setUser={setUser} open={account} onClose={() => setAccount(false)} logout={logout} />
    <HomeSubmitSheet groups={groups ?? []} cat={cat} open={logScores} onClose={() => setLogScores(false)} onSaved={afterChange} />
    <AddGroupSheet open={!!add} tab={addTab} setTab={setAddTab} onClose={() => setAdd(null)} onDone={async (id) => { setAdd(null); await loadGroups(); open(id); }} />
  </>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null), [ready, setReady] = useState(false), [slow, setSlow] = useState(false);
  const dark = !useMedia('(prefers-color-scheme: light)'), theme = (localStorage.getItem('theme') as Theme) || 'dark', mode: Mode = theme === 'system' ? (dark ? 'dark' : 'light') : theme;
  useEffect(() => { (async () => { try { if (await refresh()) setUser(await api('GET', '/users/me')); } catch {} setReady(true); })(); }, []);
  // Wake the server the moment the site opens (and whenever the tab comes
  // back), and push any results saved on this device while it was asleep.
  useEffect(() => {
    wake(); flushOutbox().catch(() => {});
    const onVis = () => { if (!document.hidden) { wake(); flushOutbox().catch(() => {}); } };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  // If the API is still waking up after a few seconds, say so instead of a bare pulsing dot.
  useEffect(() => { if (ready) return; const t = setTimeout(() => setSlow(true), 4000); return () => clearTimeout(t); }, [ready]);
  const logout = async () => { await api('POST', '/auth/logout').catch(() => {}); setToken(null); setUser(null); location.hash = '#/'; };
  // Signed-out screens use the default palette; the Shell takes over once logged in.
  useEffect(() => { if (!user) applyPalette(defaultPalette(mode), mode); }, [user, mode]);
  return <MotionConfig reducedMotion="user"><ToastProvider>
    {!ready ? <div className="boot" aria-label="Loading">{slow ? <span className="boot-note">Waking up the server, one moment…</span> : null}</div> : user
      ? <Shell user={user} setUser={setUser} logout={logout} />
      : <><Ambient bg={defaultPalette(mode).bg} orbs={defaultPalette(mode).orbs} /><Auth onAuth={setUser} /></>}
  </ToastProvider></MotionConfig>;
}
