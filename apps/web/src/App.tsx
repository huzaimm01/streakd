import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, refresh, setToken } from './api';

const Err = ({ e }: { e: string }) => (e ? <p className="err" role="alert">{e}</p> : null);
const Card = ({ title, children }: { title: string; children: ReactNode }) => <section className="card"><h2>{title}</h2>{children}</section>;

/** Run an async action with error + busy state. */
function useAction() {
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => { setErr(''); setBusy(true); try { await fn(); } catch (e: any) { setErr(e.message); } setBusy(false); };
  return { err, busy, run, setErr };
}

// ---------------- Auth ----------------
function Auth({ onAuth }: { onAuth: (u: any) => void }) {
  const resetToken = location.hash.match(/token=([a-f0-9]+)/)?.[1];
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(resetToken ? 'reset' : 'login');
  const [f, setF] = useState({ email: '', password: '', displayName: '' }); const [note, setNote] = useState('');
  const { err, busy, run } = useAction();
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => { e.preventDefault(); run(async () => {
    if (mode === 'forgot') { await api('POST', '/auth/forgot', { email: f.email }); setNote('If that email has an account, a reset link is on its way.'); return; }
    if (mode === 'reset') { await api('POST', '/auth/reset', { token: resetToken, password: f.password }); history.replaceState(null, '', location.pathname); setMode('login'); setNote('Password changed. Log in with your new password.'); return; }
    const r = await api('POST', mode === 'login' ? '/auth/login' : '/auth/register', f); setToken(r.accessToken); onAuth(r.user);
  }); };
  return <div className="wrap"><header><h1>Streak’d</h1></header>
    <form className="card" onSubmit={submit}><h2>{{ login: 'Log in', register: 'Create account', forgot: 'Reset password', reset: 'Choose a new password' }[mode]}</h2>
      {mode === 'register' && <label>Display name<input type="text" value={f.displayName} onChange={set('displayName')} required maxLength={40} /></label>}
      {mode !== 'reset' && <label>Email<input type="email" value={f.email} onChange={set('email')} required /></label>}
      {mode !== 'forgot' && <label>{mode === 'reset' ? 'New password' : 'Password'} (8+ characters)<input type="password" value={f.password} onChange={set('password')} required minLength={8} /></label>}
      <Err e={err} />{note && <p className="ok">{note}</p>}
      <button className="btn pri" disabled={busy}>{{ login: 'Log in', register: 'Create account', forgot: 'Send reset link', reset: 'Change password' }[mode]}</button>
      <p className="mute">{mode === 'login' ? <><button type="button" className="link" onClick={() => setMode('register')}>Create an account</button> · <button type="button" className="link" onClick={() => setMode('forgot')}>Forgot password?</button></> : <button type="button" className="link" onClick={() => setMode('login')}>Back to log in</button>}</p>
    </form></div>;
}

// ---------------- Pages ----------------
const gameName = (g: any, cat: any[], id: string) => g.games.find((x: any) => x.gameId === id)?.name ?? cat.find((c) => c.id === id)?.name ?? id;
const gameHint = (g: any, cat: any[], id: string) => g.games.find((x: any) => x.gameId === id)?.inputHint ?? cat.find((c) => c.id === id)?.inputHint ?? '';

function Dashboard({ g, cat }: any) {
  const [s, setS] = useState<any>(null); const { err, run } = useAction();
  useEffect(() => { run(async () => setS(await api('GET', `/groups/${g._id}/streaks`))); }, [g._id]);
  if (!s) return <Err e={err} />;
  return <><Card title="Group activity streak"><div className="grid">
      <div className="stat"><b>{s.overall.current}</b>current days</div><div className="stat"><b>{s.overall.longest}</b>longest</div><div className="stat"><b>{s.overall.total}</b>active days</div></div></Card>
    <Card title="Streak per game"><div className="scroll"><table><thead><tr><th>Game</th><th>Group now</th><th>Group best</th><th>You now</th><th>You best</th></tr></thead><tbody>
      {Object.entries<any>(s.perGame).map(([id, v]) => <tr key={id}><td>{gameName(g, cat, id)}</td><td>{v.group.current}</td><td>{v.group.longest}</td><td>{v.you.current}</td><td>{v.you.longest}</td></tr>)}</tbody></table></div></Card></>;
}

function Submit({ g, cat }: any) {
  const [vals, setVals] = useState<Record<string, string>>({}); const [errs, setErrs] = useState<Record<string, string>>({});
  const [date, setDate] = useState(''); const [msg, setMsg] = useState(''); const { err, busy, run } = useAction();
  const active = g.games.filter((x: any) => x.active);
  useEffect(() => { run(async () => {
    const { today } = await api('GET', `/groups/${g._id}/streaks`); setDate(today);
    const r = await api('GET', `/groups/${g._id}/submissions?date=${today}`); setVals(Object.fromEntries(r.items.map((i: any) => [i.gameId, i.raw])));
  }); }, [g._id]);
  const save = () => run(async () => { const r = await api('PUT', `/groups/${g._id}/submissions`, { date, results: vals }); setErrs(r.errors); const n = Object.keys(r.saved).length; setMsg(`${n} saved${Object.keys(r.errors).length ? `, ${Object.keys(r.errors).length} to fix` : ''}`); });
  return <Card title={`Submit results, ${date}`}><p className="mute">Fill in what you played and leave the rest blank. Saving again updates your result.</p>
    {active.map((x: any) => <div className="row" key={x.gameId}><div><b>{gameName(g, cat, x.gameId)}</b><div className="mute">{gameHint(g, cat, x.gameId)}</div></div>
      <div><input type="text" className={errs[x.gameId] ? 'bad' : ''} aria-label={`${gameName(g, cat, x.gameId)} result`} value={vals[x.gameId] ?? ''} onChange={(e) => setVals({ ...vals, [x.gameId]: e.target.value })} />{errs[x.gameId] && <div className="err">{errs[x.gameId]}</div>}</div></div>)}
    <Err e={err} /><p><button className="btn pri" onClick={save} disabled={busy || !date}>Save results</button> <span className="ok">{msg}</span></p></Card>;
}

function Board({ g }: any) {
  const [month, setMonth] = useState(new Date().toLocaleDateString('en-CA').slice(0, 7)); const [d, setD] = useState<any>(null); const [past, setPast] = useState<any[]>([]);
  const { err, run } = useAction();
  useEffect(() => { run(async () => setD(await api('GET', `/groups/${g._id}/championships/${month}`))); }, [g._id, month]);
  useEffect(() => { run(async () => setPast(await api('GET', `/groups/${g._id}/championships`))); }, [g._id]);
  const champ = d?.final ? d.standings.find((s: any) => s.userId === d.championId) : null;
  return <><Card title={`Championship, ${month}`}><Err e={err} />{champ && <p className="ok">Champion: {champ.displayName}</p>}
      {d && (d.standings.length ? <div className="scroll"><table><thead><tr><th>Rank</th><th>Player</th><th>Points</th><th>Games</th><th>Top scores</th></tr></thead><tbody>
        {d.standings.map((s: any) => <tr key={s.userId}><td>{s.rank}</td><td>{s.displayName}</td><td>{s.total}</td><td>{s.completed}</td><td>{s.topScores}</td></tr>)}</tbody></table></div> : <p className="mute">No scored results this month yet. Submit a preset game to get on the board.</p>)}
      <p className="mute">{d?.final ? 'Final standings' : 'Month in progress'}. Custom games don’t earn points.</p></Card>
    {past.length > 0 && <Card title="Past championships"><div className="sw">{past.map((c) => <button key={c._id} className="tab" aria-current={c.month === month} onClick={() => setMonth(c.month)}>{c.month}</button>)}</div></Card>}</>;
}

function GroupPage({ g, cat, reload, leave }: any) {
  const admin = g.role !== 'member'; const [f, setF] = useState({ name: g.name, description: g.description, mainColor: g.mainColor, accentColor: g.accentColor, timezone: g.timezone });
  const [custom, setCustom] = useState({ name: '', inputHint: '' }); const [code, setCode] = useState(''); const { err, run } = useAction();
  const patch = (u: any) => run(async () => { await api('PATCH', `/groups/${g._id}`, u); await reload(); });
  return <><Card title="Members"><table><tbody>{g.members?.map((m: any) => <tr key={m.userId}><td>{m.displayName}</td><td className="mute">{m.role}</td></tr>)}</tbody></table>
      {admin && <p><button className="btn" onClick={() => run(async () => setCode((await api('POST', `/groups/${g._id}/invites`)).code))}>Create invite code</button> {code && <b>{code}</b>} <span className="mute">{code && 'valid 7 days'}</span></p>}<Err e={err} /></Card>
    {admin && <Card title="Group settings"><label>Name<input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label>Description<input type="text" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <label>Time zone (e.g. America/Toronto)<input type="text" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></label>
      <div className="sw"><label>Background colour<br /><input type="color" value={f.mainColor} onChange={(e) => setF({ ...f, mainColor: e.target.value })} /></label><label>Accent colour<br /><input type="color" value={f.accentColor} onChange={(e) => setF({ ...f, accentColor: e.target.value })} /></label></div>
      <p><button className="btn pri" onClick={() => patch(f)}>Save settings</button></p></Card>}
    <Card title="Games"><p className="mute">A group needs at least two enabled games. Turning one off keeps its history.</p>
      {g.games.map((x: any) => <label key={x.gameId} className="check"><input type="checkbox" checked={x.active} disabled={!admin} onChange={(e) => run(async () => { await api('PATCH', `/groups/${g._id}/games`, { gameId: x.gameId, active: e.target.checked }); await reload(); })} />{gameName(g, cat, x.gameId)}{x.custom && <span className="mute">(custom, no points)</span>}</label>)}
      {admin && <><h3>Add a custom game</h3><input type="text" placeholder="Name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
        <input type="text" placeholder="What to enter, e.g. time in seconds" value={custom.inputHint} onChange={(e) => setCustom({ ...custom, inputHint: e.target.value })} />
        <button className="btn" onClick={() => run(async () => { await api('POST', `/groups/${g._id}/games/custom`, custom); setCustom({ name: '', inputHint: '' }); await reload(); })}>Add game</button></>}</Card>
    <Card title="Leave or delete"><button className="btn danger" onClick={() => confirm('Leave this group?') && run(async () => { await api('POST', `/groups/${g._id}/leave`); await leave(); })}>Leave group</button>{' '}
      {g.role === 'owner' && <button className="btn danger" onClick={() => confirm('Delete this group and all its results? This cannot be undone.') && run(async () => { await api('DELETE', `/groups/${g._id}`); await leave(); })}>Delete group</button>}
      {g.role === 'owner' && <p className="mute">Owners must transfer ownership (API) before leaving.</p>}</Card></>;
}

function Groups({ onDone }: any) {
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const { err, run } = useAction();
  return <><Card title="Create a group"><input type="text" placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn pri" onClick={() => run(async () => onDone((await api('POST', '/groups', { name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }))._id))}>Create group</button></Card>
    <Card title="Join with an invite code"><input type="text" placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} />
      <button className="btn pri" onClick={() => run(async () => onDone((await api('POST', '/groups/join', { code: code.trim() })).groupId))}>Join group</button><Err e={err} /></Card></>;
}

function Profile({ user, setUser, theme, setTheme, logout }: any) {
  const [name, setName] = useState(user.displayName); const { err, run } = useAction();
  return <><Card title="Profile"><label>Display name<input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
      <button className="btn pri" onClick={() => run(async () => setUser(await api('PATCH', '/users/me', { displayName: name })))}>Save name</button><Err e={err} /></Card>
    <Card title="Theme">{['system', 'light', 'dark'].map((t) => <button key={t} className="tab" aria-current={theme === t} onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}</Card>
    <Card title="Session"><button className="btn" onClick={logout}>Log out</button></Card></>;
}

// ---------------- Shell ----------------
const TABS = [['dash', 'Dashboard'], ['submit', 'Submit results'], ['board', 'Leaderboard'], ['group', 'Group'], ['groups', 'All groups'], ['me', 'Profile']];
function Shell({ user, setUser }: any) {
  const [groups, setGroups] = useState<any[]>([]); const [cat, setCat] = useState<any[]>([]); const [gid, setGid] = useState(localStorage.getItem('gid') || '');
  const [tab, setTab] = useState('dash'); const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark'); const [detail, setDetail] = useState<any>(null);
  const load = async (pick?: string) => { const gs = await api('GET', '/groups'); setGroups(gs); const id = pick || (gs.find((x: any) => x._id === gid) ? gid : gs[0]?._id || ''); setGid(id); localStorage.setItem('gid', id); if (!gs.length) setTab('groups'); };
  useEffect(() => { load(); api('GET', '/games').then(setCat); }, []);
  useEffect(() => { gid ? api('GET', `/groups/${gid}`).then(setDetail).catch(() => setDetail(null)) : setDetail(null); }, [gid, groups]);
  const g = detail && detail._id === gid ? detail : null;
  useEffect(() => { const r = document.documentElement; theme === 'system' ? r.removeAttribute('data-theme') : (r.dataset.theme = theme); localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { const r = document.documentElement.style; r.setProperty('--main', g?.mainColor || '#0f1b3d'); r.setProperty('--accent', g?.accentColor || '#ffffff'); }, [g]);
  const logout = async () => { await api('POST', '/auth/logout'); setToken(null); setUser(null); };
  return <div className="wrap"><header><div className="av">{(g?.name || user.displayName)[0].toUpperCase()}</div><h1>{g?.name || 'Streak’d'}</h1>
      {groups.length > 1 && <select className="switcher" value={gid} onChange={(e) => { setGid(e.target.value); localStorage.setItem('gid', e.target.value); }} aria-label="Switch group">{groups.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select>}</header>
    <nav>{TABS.map(([k, l]) => <button key={k} className="tab" aria-current={tab === k} onClick={() => setTab(k)}>{l}</button>)}</nav>
    {tab === 'groups' && <Groups onDone={(id: string) => { load(id); setTab('dash'); }} />}
    {tab === 'me' && <Profile user={user} setUser={setUser} theme={theme} setTheme={setTheme} logout={logout} />}
    {g && tab === 'dash' && <Dashboard g={g} cat={cat} />}{g && tab === 'submit' && <Submit key={g._id} g={g} cat={cat} />}
    {g && tab === 'board' && <Board g={g} />}{g && tab === 'group' && <GroupPage g={g} cat={cat} reload={() => load(g._id)} leave={() => load('')} />}
  </div>;
}

export default function App() {
  const [user, setUser] = useState<any>(null); const [ready, setReady] = useState(false);
  useEffect(() => { (async () => { try { if (await refresh()) setUser(await api('GET', '/users/me')); } catch {} setReady(true); })(); }, []);
  if (!ready) return <div className="wrap">Loading</div>;
  return user ? <Shell user={user} setUser={setUser} /> : <Auth onAuth={setUser} />;
}
