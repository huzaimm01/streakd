import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { api, dropSubmission, queueSubmission, sleep } from './api';
import { PRESETS, isHex } from './color';
import { Btn, ColorLine, ConfirmBtn, Err, Field, Icon, Segmented, Sheet, Switch, useAction, useToast } from './ui';
import type { CatalogGame, Group, Role, User } from './types';

export const meta = (g: Group, cat: CatalogGame[], id: string) => {
  const c = g.games.find((x) => x.gameId === id), p = cat.find((x) => x.id === id);
  return { name: c?.name ?? p?.name ?? id, hint: c?.inputHint ?? p?.inputHint ?? '', icon: p?.icon ?? 'sparkles', custom: !!c?.custom };
};
const QUICK: Record<string, string[]> = { wordle: ['1', '2', '3', '4', '5', '6', 'X'], flagle: ['1', '2', '3', '4', '5', '6', 'X'], worldle: ['1', '2', '3', '4', '5', 'X'], connections: ['0', '1', '2', '3', '4'] };

// ------------------------------------------------------------- log today's results
export function SubmitSheet({ g, cat, open, onClose, onSaved }: { g: Group; cat: CatalogGame[]; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({}); const [errs, setErrs] = useState<Record<string, string>>({}); const [date, setDate] = useState('');
  const { err, busy, run } = useAction(); const toast = useToast();
  const active = g.games.filter((x) => x.active);
  useEffect(() => { if (!open) return; setErrs({}); run(async () => {
    const { today } = await api('GET', `/groups/${g._id}/streaks`); setDate(today);
    const r = await api('GET', `/groups/${g._id}/submissions?date=${today}`); setVals(Object.fromEntries(r.items.map((i: any) => [i.gameId, i.raw])));
  }); }, [open, g._id]);
  const save = () => run(async () => {
    const p = api('PUT', `/groups/${g._id}/submissions`, { date, results: vals });
    const savedToast = (r: any) => {
      const n = Object.keys(r.saved).length, bad = Object.keys(r.errors).length, pts = Object.values<any>(r.saved).reduce((a, s) => a + (s.points ?? 0), 0);
      const syncedNames = (r.synced ?? []).map((s: any) => s.name), skippedNames = (r.skipped ?? []).map((s: any) => s.name);
      return { n, bad, msg: n ? `Saved ${n} result${n > 1 ? 's' : ''}${pts ? ` · +${pts} pts` : ''}${syncedNames.length ? ` · also in ${syncedNames.join(', ')}` : ''}${skippedNames.length ? ` · not in ${skippedNames.join(', ')} (future date there)` : ''}` : 'Cleared' };
    };
    // Fast path: the server is already awake, answer came back at once.
    const w = await Promise.race([p.then((r) => ({ done: true as const, r })), sleep(2500).then(() => ({ done: false as const }))]);
    if (w.done) {
      const r = w.r; setErrs(r.errors); onSaved();
      const { bad, msg } = savedToast(r);
      if (!bad) { toast(msg); onClose(); } else toast(`${bad} to fix`, 'err');
      return;
    }
    // Slow path: the server is still waking. Close now and finish in the
    // background — the user never waits on a cold start. The results are
    // also queued on this device, so if the push ultimately fails they are
    // sent on the next open instead of being lost.
    queueSubmission(g._id, date, vals);
    onClose(); toast('Saving in the background — sending once the server’s awake');
    p.then((r) => {
      setErrs(r.errors); onSaved(); dropSubmission(g._id, date);
      const { bad, msg } = savedToast(r);
      if (!bad) toast(msg); else toast(`${bad} to fix — open Today’s results to correct`, 'err');
    }).catch(() => toast('Couldn’t reach the server — saved on this device, will send when it’s awake', 'err'));
  });
  return <Sheet open={open} onClose={onClose} title="Today’s results">
    <p className="mute lede">Fill in what you played, leave the rest blank. Saving again updates it. Results also sync to your other groups that play the same games.</p>
    <div className="games-list">{active.map((x) => { const m = meta(g, cat, x.gameId), q = QUICK[x.gameId], v = vals[x.gameId] ?? '';
      return <div className="game-row" key={x.gameId} data-bad={!!errs[x.gameId] || undefined}>
        <div className="game-head"><span className="tile-ico"><Icon name={m.icon} size={18} /></span><div><b>{m.name}</b><small className="mute">{m.hint}</small></div></div>
        {q ? <div className="chips">{q.map((c) => <button key={c} type="button" className="pick" aria-pressed={v.toUpperCase() === c} onClick={() => setVals({ ...vals, [x.gameId]: v.toUpperCase() === c ? '' : c })}>{c}</button>)}</div>
          : <input className="input" inputMode="text" value={v} aria-label={`${m.name} result`} onChange={(e) => setVals({ ...vals, [x.gameId]: e.target.value })} />}
        {errs[x.gameId] && <p className="err">{errs[x.gameId]}</p>}
      </div>; })}</div>
    <Err e={err} />
    <Btn variant="primary" className="block sticky" busy={busy} disabled={!date} onClick={save}>Save results</Btn>
  </Sheet>;
}

// ------------------------------------------------------------- invite
export function InviteSheet({ g, open, onClose }: { g: Group; open: boolean; onClose: () => void }) {
  const [code, setCode] = useState(''); const { err, busy, run } = useAction(); const toast = useToast();
  useEffect(() => { if (!open) setCode(''); }, [open]);
  const text = `Join ${g.name} on Streak’d with code ${code}`;
  return <Sheet open={open} onClose={onClose} title="Invite people">
    <p className="mute lede">Codes work for 7 days. Anyone with a code can join.</p>
    {code ? <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="code-box"><code>{code}</code>
      <div className="row-actions"><Btn onClick={() => navigator.clipboard?.writeText(code).then(() => toast('Code copied'))}><Icon name="copy" size={16} />Copy</Btn>
        {navigator.share && <Btn variant="primary" onClick={() => navigator.share({ text }).catch(() => {})}>Share</Btn>}</div></motion.div>
      : <Btn variant="primary" className="block" busy={busy} onClick={() => run(async () => setCode((await api('POST', `/groups/${g._id}/invites`)).code))}>Create invite code</Btn>}
    <Err e={err} />
  </Sheet>;
}

// ------------------------------------------------------------- members
export function MembersSheet({ g, me, open, onClose, reload }: { g: Group; me: string; open: boolean; onClose: () => void; reload: () => Promise<unknown> }) {
  const [sel, setSel] = useState(''); const { err, run } = useAction(); const rank = { member: 0, admin: 1, owner: 2 }; const mine = rank[g.role];
  const act = (fn: () => Promise<unknown>) => run(async () => { await fn(); setSel(''); await reload(); });
  return <Sheet open={open} onClose={onClose} title="Members">
    {!g.members ? <p className="mute">Loading…</p> : <div className="members">{g.members.map((m) => {
      const you = String(m.userId) === me, can = !you && mine >= 1 && m.role !== 'owner' && (m.role === 'member' || g.role === 'owner'), uid = m.userId;
      return <div key={uid} className="member" data-open={sel === uid || undefined}>
        <button className="member-row" disabled={!can} onClick={() => setSel(sel === uid ? '' : uid)}>
          <span className="avatar sm">{(m.displayName || '?')[0].toUpperCase()}</span><b>{m.displayName ?? 'Former member'}{you && <small className="you">you</small>}</b>
          <span className="chip">{m.role}</span>{can && <Icon name="next" size={16} className="chev" />}
        </button>
        {sel === uid && <motion.div className="member-actions" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
          {g.role === 'owner' && <Btn onClick={() => act(() => api('PATCH', `/groups/${g._id}/members/${uid}`, { role: m.role === 'admin' ? 'member' : 'admin' }))}>{m.role === 'admin' ? 'Make member' : 'Make admin'}</Btn>}
          {g.role === 'owner' && <ConfirmBtn label="Confirm transfer" onConfirm={() => act(() => api('POST', `/groups/${g._id}/transfer`, { userId: uid }))}>Make owner</ConfirmBtn>}
          <ConfirmBtn label="Confirm remove" onConfirm={() => act(() => api('DELETE', `/groups/${g._id}/members/${uid}`))}>Remove</ConfirmBtn>
        </motion.div>}
      </div>; })}</div>}
    <Err e={err} />
  </Sheet>;
}

// ------------------------------------------------------------- games
export function GamesSheet({ g, cat, open, onClose, reload }: { g: Group; cat: CatalogGame[]; open: boolean; onClose: () => void; reload: () => Promise<unknown> }) {
  const admin = g.role !== 'member'; const { err, run, setErr } = useAction(); const [c, setC] = useState({ name: '', inputHint: '' });
  return <Sheet open={open} onClose={onClose} title="Games">
    <p className="mute lede">A group needs at least two on. Turning one off keeps its history.</p>
    <div className="games-list">{g.games.map((x) => { const m = meta(g, cat, x.gameId); return (
      <div className="toggle-row" key={x.gameId}><span className="tile-ico"><Icon name={m.icon} size={18} /></span>
        <div><b>{m.name}</b>{m.custom && <small className="mute">Custom · no points</small>}</div>
        <Switch label={m.name} on={x.active} disabled={!admin} onChange={(v) => run(async () => { await api('PATCH', `/groups/${g._id}/games`, { gameId: x.gameId, active: v }); await reload(); })} /></div>); })}</div>
    {admin && <><h3>Add a custom game</h3>
      <input className="input" placeholder="Name" value={c.name} maxLength={40} onChange={(e) => setC({ ...c, name: e.target.value })} />
      <input className="input" placeholder="What to enter, e.g. time in seconds" value={c.inputHint} maxLength={80} onChange={(e) => setC({ ...c, inputHint: e.target.value })} />
      <Btn disabled={!c.name.trim()} onClick={() => run(async () => { await api('POST', `/groups/${g._id}/games/custom`, c); setC({ name: '', inputHint: '' }); await reload(); })}><Icon name="plus" size={16} />Add game</Btn></>}
    <Err e={err} />
  </Sheet>;
}

// ------------------------------------------------------------- colour picker (shared by settings + create)
export function ColorPicker({ main, accent, onChange }: { main: string; accent: string; onChange: (m: string, a: string) => void }) {
  return <div className="colors">
    <div className="presets">{PRESETS.map(([m, a]) => <button key={m + a} type="button" aria-label={`Colour pair ${m} and ${a}`} aria-pressed={m === main && a === accent} className="preset" onClick={() => onChange(m, a)}><i style={{ background: m }} /><i style={{ background: a }} /></button>)}</div>
    <div className="custom-colors">
      <label>Background<input type="color" value={main} onChange={(e) => onChange(e.target.value, accent)} /></label>
      <label>Accent<input type="color" value={accent} onChange={(e) => onChange(main, e.target.value)} /></label>
      <ColorLine main={main} accent={accent} />
    </div>
  </div>;
}

// ------------------------------------------------------------- settings
export function SettingsSheet({ g, open, onClose, reload }: { g: Group; open: boolean; onClose: () => void; reload: () => Promise<unknown> }) {
  const init = () => ({ name: g.name, description: g.description, mainColor: g.mainColor, accentColor: g.accentColor, timezone: g.timezone });
  const [f, setF] = useState(init); const { err, busy, run } = useAction(); const toast = useToast();
  useEffect(() => { if (open) setF(init()); }, [open]);
  const zones: string[] = (Intl as any).supportedValuesOf?.('timeZone') ?? [];
  return <Sheet open={open} onClose={onClose} title="Group settings">
    <Field label="Name"><input className="input" value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
    <Field label="Description"><input className="input" value={f.description} maxLength={300} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
    <Field label="Time zone"><input className="input" list="tzs" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></Field>
    <datalist id="tzs">{zones.map((z) => <option key={z} value={z} />)}</datalist>
    <span className="label">Colours</span>
    <ColorPicker main={f.mainColor} accent={f.accentColor} onChange={(m, a) => setF({ ...f, mainColor: m, accentColor: a })} />
    <Err e={err} />
    <Btn variant="primary" className="block sticky" busy={busy} disabled={!f.name.trim() || !isHex(f.mainColor) || !isHex(f.accentColor)}
      onClick={() => run(async () => { await api('PATCH', `/groups/${g._id}`, f); await reload(); toast('Settings saved'); onClose(); })}>Save settings</Btn>
  </Sheet>;
}

// ------------------------------------------------------------- leave / delete
export function ConfirmSheet({ open, onClose, title, body, action, onConfirm }: { open: boolean; onClose: () => void; title: string; body: string; action: string; onConfirm: () => Promise<unknown> }) {
  const { err, busy, run } = useAction();
  return <Sheet open={open} onClose={onClose} title={title}>
    <p className="lede">{body}</p><Err e={err} />
    <div className="row-actions"><Btn onClick={onClose}>Cancel</Btn><Btn variant="danger" busy={busy} onClick={() => run(onConfirm)}>{action}</Btn></div>
  </Sheet>;
}

// ------------------------------------------------------------- account
export function AccountSheet({ user, setUser, open, onClose, logout }: { user: User; setUser: (u: User) => void; open: boolean; onClose: () => void; logout: () => void }) {
  const [name, setName] = useState(user.displayName); const { err, busy, run } = useAction(); const toast = useToast();
  useEffect(() => { if (open) setName(user.displayName); }, [open]);
  return <Sheet open={open} onClose={onClose} title="Account">
    <Field label="Display name"><input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></Field>
    <p className="mute lede">{user.email}</p><Err e={err} />
    <div className="row-actions"><Btn variant="primary" busy={busy} disabled={!name.trim() || name === user.displayName} onClick={() => run(async () => { setUser(await api('PATCH', '/users/me', { displayName: name })); toast('Name updated'); onClose(); })}>Save name</Btn>
      <Btn onClick={logout}><Icon name="logout" size={16} />Log out</Btn></div>
  </Sheet>;
}

// ------------------------------------------------------------- create / join
export function AddGroupSheet({ open, tab, setTab, onClose, onDone }: { open: boolean; tab: 'create' | 'join'; setTab: (t: 'create' | 'join') => void; onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [[main, accent], setCol] = useState(PRESETS[0]); const { err, busy, run, setErr } = useAction();
  useEffect(() => { if (open) { setName(''); setCode(''); setErr(''); } }, [open]);
  return <Sheet open={open} onClose={onClose} title={tab === 'create' ? 'New group' : 'Join a group'}>
    <Segmented id="add" value={tab} onChange={setTab} options={[{ id: 'create', label: 'Create' }, { id: 'join', label: 'Join with code' }]} />
    <div className="spacer" />
    {tab === 'create' ? <>
      <Field label="Group name"><input className="input" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
      <span className="label">Colours</span><ColorPicker main={main} accent={accent} onChange={(m, a) => setCol([m, a])} /><Err e={err} />
      <Btn variant="primary" className="block sticky" busy={busy} disabled={!name.trim()} onClick={() => run(async () => onDone((await api('POST', '/groups', { name, mainColor: main, accentColor: accent, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }))._id))}>Create group</Btn>
    </> : <>
      <Field label="Invite code"><input className="input mono" autoFocus value={code} onChange={(e) => setCode(e.target.value)} /></Field><Err e={err} />
      <Btn variant="primary" className="block sticky" busy={busy} disabled={code.trim().length < 4} onClick={() => run(async () => onDone((await api('POST', '/groups/join', { code: code.trim() })).groupId))}>Join group</Btn>
    </>}
  </Sheet>;
}
export type { Role };
