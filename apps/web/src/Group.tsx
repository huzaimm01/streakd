import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Heatmap, heatmapStart, type Who } from './Heatmap';
import { ConfirmSheet, GamesSheet, InviteSheet, MembersSheet, SettingsSheet, SubmitSheet, meta } from './Sheets';
import { CountUp, Icon, Menu, plural, Segmented, ThemeSwitch } from './ui';
import type { Activity, CatalogGame, Group, Streaks, Theme } from './types';

type View = 'overview' | 'board' | 'activity';
type SheetId = null | 'submit' | 'invite' | 'members' | 'games' | 'settings' | 'leave' | 'delete';

function useGroupData(id: string) {
  const [streaks, setS] = useState<Streaks | null>(null), [activity, setA] = useState<Activity | null>(null);
  const load = useCallback(async () => {
    const [s, a] = await Promise.allSettled([api('GET', `/groups/${id}/streaks`), api('GET', `/groups/${id}/activity`)]);
    if (s.status === 'fulfilled') setS(s.value); if (a.status === 'fulfilled') setA(a.value);
  }, [id]);
  useEffect(() => { setS(null); setA(null); load(); }, [id]);
  return { streaks, activity, load };
}

const Ring = ({ value, max }: { value: number; max: number }) => (
  <svg viewBox="0 0 80 80" width="76" height="76" className="ring" aria-hidden="true"><circle cx="40" cy="40" r="32" className="ring-track" />
    <motion.circle cx="40" cy="40" r="32" className="ring-fill" initial={{ pathLength: 0 }} animate={{ pathLength: max ? Math.min(1, value / max) : 0 }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }} /></svg>
);

// ------------------------------------------------------------- overview
function Overview({ g, cat, streaks, activity }: { g: Group; cat: CatalogGame[]; streaks: Streaks | null; activity: Activity | null }) {
  if (!streaks) return <div className="skeleton hero-skel glass" />;
  const day = activity?.days[streaks.today], members = activity?.members ?? g.members?.length ?? 1, o = streaks.overall;
  const line = day?.players ? `${day.players} of ${members} played today` : o.current ? 'Nobody’s played yet. Keep the streak alive.' : 'Log a result to start a streak.';
  return <>
    <motion.section className="glass hero" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
      <div>
        <div className="hero-num"><span className="flame-big"><Icon name="flame" size={30} /></span><span className="num"><CountUp value={o.current} /></span></div>
        <div className="hero-label">day group streak</div>
        <p className="mute hero-sub">{line}</p>
      </div>
      <div className="hero-ring"><Ring value={day?.players ?? 0} max={members} /><span className="num">{day?.players ?? 0}<small>/{members}</small></span></div>
    </motion.section>
    <div className="mini-stats">
      <div><b className="num">{o.longest}</b><span>longest streak</span></div><div><b className="num">{o.total}</b><span>{plural(o.total, 'active day')}</span></div>
    </div>
    <h2 className="section">Per game</h2>
    <div className="tiles">{g.games.filter((x) => x.active && streaks.perGame[x.gameId]).map((x, i) => {
      const m = meta(g, cat, x.gameId), s = streaks.perGame[x.gameId];
      return <motion.div key={x.gameId} className="glass tile" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.045 }}>
        <div className="tile-head"><span className="tile-ico"><Icon name={m.icon} size={18} /></span><b>{m.name}</b></div>
        <div className="tile-stats">
          <div><span className="k">You</span><span className="v num"><Icon name="flame" size={15} />{s.you.current}</span><span className="s">best {s.you.longest}</span></div>
          <div><span className="k">Group</span><span className="v num"><Icon name="flame" size={15} />{s.group.current}</span><span className="s">best {s.group.longest}</span></div>
        </div>
      </motion.div>; })}</div>
  </>;
}

// ------------------------------------------------------------- leaderboard
const shift = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
function Board({ g, me, cur }: { g: Group; me: string; cur: string }) {
  const [sel, setSel] = useState<string | null>(null), [d, setD] = useState<any>(null), [err, setErr] = useState('');
  const month = sel ?? cur;
  useEffect(() => { let off = false; setD(null); setErr(''); api('GET', `/groups/${g._id}/championships/${month}`).then((r) => !off && setD(r)).catch((e) => !off && setErr(e.message)); return () => { off = true; }; }, [g._id, month]);
  const max = d?.standings?.[0]?.total || 1, label = new Date(month + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return <>
    <div className="month-nav">
      <button className="icon-btn glass" aria-label="Previous month" onClick={() => setSel(shift(month, -1))}><Icon name="back" /></button>
      <div><h2>{label}</h2><span className={'chip' + (d?.final ? '' : ' live')}>{d ? (d.final ? 'Final' : 'Live') : ' '}</span></div>
      <button className="icon-btn glass" aria-label="Next month" disabled={month >= cur} onClick={() => setSel(shift(month, 1))}><Icon name="next" /></button>
    </div>
    {err && <p className="err">{err}</p>}
    {!d && !err && <div className="skeleton glass rows-skel" />}
    {d && !d.standings.length && <div className="glass empty small"><Icon name="trophy" size={28} /><p className="mute">No scored results this month yet.<br />Log a preset game to get on the board.</p></div>}
    {d && d.standings.length > 0 && <div className="glass board"><AnimatePresence mode="popLayout" initial={false}>{d.standings.map((s: any, i: number) => (
      <motion.div key={month + s.userId} layout className="brow" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 28 }}>
        <motion.span className="bar" initial={{ scaleX: 0 }} animate={{ scaleX: s.total / max }} transition={{ delay: 0.15 + i * 0.04, duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
        <span className={`rank r${s.rank}`}>{s.rank === 1 && d.final ? <Icon name="crown" size={16} /> : s.rank}</span>
        <span className="who"><b>{s.displayName}{s.userId === me && <small className="you">you</small>}</b><small className="mute">{s.completed} {plural(s.completed, 'game')} · {s.topScores} perfect</small></span>
        <span className="pts num">{s.total}</span>
      </motion.div>))}</AnimatePresence></div>}
    <p className="mute fine">Custom games don’t earn points.</p>
  </>;
}

// ------------------------------------------------------------- activity
function ActivityView({ g, activity }: { g: Group; activity: Activity | null }) {
  const [who, setWho] = useState<Who>('you');
  if (!activity) return <div className="skeleton glass rows-skel" />;
  // Stats cover exactly the 20 weeks the heatmap shows, not the full year of data.
  const from = heatmapStart(activity.today);
  const vals = Object.entries(activity.days).filter(([d]) => d >= from).map(([d, v]) => ({ d, n: who === 'you' ? v.you : v.group, p: who === 'you' ? v.you : v.players })).filter((x) => x.p > 0);
  const results = vals.reduce((a, x) => a + x.n, 0), best = vals.reduce<{ d: string; n: number } | null>((b, x) => (!b || x.n > b.n ? x : b), null);
  return <>
    <div className="act-head"><h2>Last 20 weeks</h2><Segmented small id="who" value={who} onChange={(v) => setWho(v as Who)} options={[{ id: 'you', label: 'You' }, { id: 'group', label: 'Group' }]} /></div>
    <Heatmap days={activity.days} today={activity.today} who={who} members={activity.members} games={g.games.filter((x) => x.active).length} />
    <div className="mini-stats three"><div><b className="num">{vals.length}</b><span>{plural(vals.length, 'active day')}</span></div><div><b className="num">{results}</b><span>{plural(results, 'result')}</span></div>
      <div><b className="num">{best ? best.n : 0}</b><span>best day</span></div></div>
  </>;
}

// ------------------------------------------------------------- page
export function GroupView({ g, cat, me, theme, setTheme, back, reload, onLeft, openAccount }: {
  g: Group; cat: CatalogGame[]; me: string; theme: Theme; setTheme: (t: Theme) => void;
  back: () => void; reload: () => Promise<unknown>; onLeft: () => void; openAccount: () => void;
}) {
  const [view, setView] = useState<View>('overview'), [sheet, setSheet] = useState<SheetId>(null);
  const { streaks, activity, load } = useGroupData(g._id), admin = g.role !== 'member';
  const today = streaks?.today ?? activity?.today, done = !!(today && activity?.days[today]?.you);
  const cur = today?.slice(0, 7) ?? new Date().toLocaleDateString('en-CA').slice(0, 7), close = () => setSheet(null);
  return <div className="page group">
    <header className="top">
      <button className="icon-btn glass" onClick={back} aria-label="All groups"><Icon name="back" /></button>
      <div className="ghead"><h1>{g.name}</h1></div>
      <Menu label="Group menu" trigger={<Icon name="more" />} top={<ThemeSwitch theme={theme} setTheme={setTheme} />} items={[
        { label: 'Invite people', icon: 'invite', onClick: () => setSheet('invite'), hidden: !admin }, { label: 'Members', icon: 'users', onClick: () => setSheet('members') },
        { label: 'Games', icon: 'grid-3x3', onClick: () => setSheet('games') }, { label: 'Settings', icon: 'sliders', onClick: () => setSheet('settings'), hidden: !admin },
        'divider', { label: 'Account', icon: 'user', onClick: openAccount }, 'divider',
        { label: 'Leave group', icon: 'logout', danger: true, onClick: () => setSheet('leave'), hidden: g.role === 'owner' }, { label: 'Delete group', icon: 'trash', danger: true, onClick: () => setSheet('delete'), hidden: g.role !== 'owner' }]} />
    </header>
    {g.description && <p className="mute gdesc">{g.description}</p>}

    <div className="seg-wrap"><Segmented id="view" value={view} onChange={(v) => setView(v as View)} options={[{ id: 'overview', label: 'Overview' }, { id: 'board', label: 'Board' }, { id: 'activity', label: 'Activity' }]} /></div>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={view} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
        {view === 'overview' && <Overview g={g} cat={cat} streaks={streaks} activity={activity} />}
        {view === 'board' && <Board g={g} me={me} cur={cur} />}
        {view === 'activity' && <ActivityView g={g} activity={activity} />}
      </motion.div>
    </AnimatePresence>

    <div className="cta-wrap"><motion.button className="cta" initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 22 }} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} onClick={() => setSheet('submit')}>
      <Icon name={done ? 'check' : 'plus'} size={20} />{done ? 'Update today’s results' : 'Log today’s results'}</motion.button></div>

    <SubmitSheet g={g} cat={cat} open={sheet === 'submit'} onClose={close} onSaved={load} />
    <InviteSheet g={g} open={sheet === 'invite'} onClose={close} />
    <MembersSheet g={g} me={me} open={sheet === 'members'} onClose={close} reload={reload} />
    <GamesSheet g={g} cat={cat} open={sheet === 'games'} onClose={close} reload={async () => { await reload(); await load(); }} />
    <SettingsSheet g={g} open={sheet === 'settings'} onClose={close} reload={reload} />
    <ConfirmSheet open={sheet === 'leave'} onClose={close} title="Leave this group?" body="You can rejoin later with a new invite code. Your results stay in the group." action="Leave group" onConfirm={async () => { await api('POST', `/groups/${g._id}/leave`); onLeft(); }} />
    <ConfirmSheet open={sheet === 'delete'} onClose={close} title="Delete this group?" body="This permanently deletes the group, its members and every result. It can’t be undone." action="Delete forever" onConfirm={async () => { await api('DELETE', `/groups/${g._id}`); onLeft(); }} />
  </div>;
}
