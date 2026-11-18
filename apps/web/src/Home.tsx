import { motion, useSpring } from 'framer-motion';
import type { PointerEvent } from 'react';
import { Avatar, Icon, Menu, ThemeSwitch } from './ui';
import { meta } from './Sheets';
import type { CatalogGame, Group, Theme, User } from './types';

function GroupCard({ g, cat, i, streak, onOpen }: { g: Group; cat: CatalogGame[]; i: number; streak?: number; onOpen: () => void }) {
  const rx = useSpring(0, { stiffness: 220, damping: 20 }), ry = useSpring(0, { stiffness: 220, damping: 20 });
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    ry.set((x - 0.5) * 9); rx.set(-(y - 0.5) * 9);
  };
  const active = g.games.filter((x) => x.active);
  const pending = g.pendingToday ?? [];
  const done = Math.max(0, active.length - pending.length);
  const names = g.memberNames ?? [], extra = (g.memberCount ?? names.length) - names.length;
  return <motion.div initial={{ opacity: 0, y: 34, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.12 + i * 0.08, type: 'spring', stiffness: 130, damping: 17 }}>
    <motion.button className="glass gcard" style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
      onPointerMove={move} onPointerLeave={() => { rx.set(0); ry.set(0); }} onClick={onOpen} aria-label={`Open ${g.name}`}>
      <span className="gcard-top">
        <span className="avatars">
          {names.map((n) => <span key={n} className="mini-avatar">{(n || '?')[0].toUpperCase()}</span>)}
          {extra > 0 && <span className="mini-avatar more">+{extra}</span>}
        </span>
        {streak ? <span className="chip flame"><Icon name="flame" size={14} />{streak}</span> : null}
      </span>
      <h3>{g.name}</h3>
      {g.pendingToday !== undefined && <>
        <span className="pend-row">
          {pending.length ? <>
            {pending.slice(0, 4).map((id) => <span key={id} className="pend-ico"><Icon name={meta(g, cat, id).icon} size={15} /></span>)}
            <span>{pending.length} left today</span>
          </> : <><span className="pend-ico done"><Icon name="check" size={15} /></span><span className="done">All caught up</span></>}
        </span>
        <span className="today-progress">
          <span className="today-track"><i style={{ width: `${active.length ? (done / active.length) * 100 : 0}%` }} /></span>
          <span>{done}/{active.length} today</span>
        </span>
      </>}
    </motion.button>
  </motion.div>;
}

export function Home({ user, groups, cat, streaks, theme, setTheme, onOpen, onAdd, onAccount, onLogout }: {
  user: User; groups: Group[] | null; cat: CatalogGame[]; streaks: Record<string, number>; theme: Theme; setTheme: (t: Theme) => void;
  onOpen: (id: string) => void; onAdd: (tab: 'create' | 'join') => void; onAccount: () => void; onLogout: () => void;
}) {
  return <div className="page">
    <header className="top">
      <span className="brand sm"><span className="brand-mark"><Icon name="flame" size={16} /></span>Streak’d</span>
      <Menu label="Menu" trigger={<Avatar name={user.displayName} size={34} />} top={<ThemeSwitch theme={theme} setTheme={setTheme} />}
        items={[{ label: 'Account', icon: 'user', onClick: onAccount }, { label: 'New group', icon: 'plus', onClick: () => onAdd('create') }, { label: 'Join with a code', icon: 'invite', onClick: () => onAdd('join') }, 'divider', { label: 'Log out', icon: 'logout', onClick: onLogout }]} />
    </header>

    <div className="home-head">
      <h1>Your Groups</h1>
      <button className="btn primary sm" onClick={() => onAdd('create')}><Icon name="plus" size={16} />New</button>
    </div>

    {groups === null && <div className="gcards">{[0, 1, 2].map((i) => <div key={i} className="glass gcard skeleton" />)}</div>}

    {groups && groups.length === 0 && <motion.div className="glass empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
      <span className="empty-ico"><Icon name="flame" size={30} /></span>
      <h2>Start a streak with friends</h2><p className="mute">Create a group for your daily puzzles, or join one with an invite code.</p>
      <div className="row-actions"><button className="btn primary" onClick={() => onAdd('create')}><Icon name="plus" size={18} />Create a group</button><button className="btn glass" onClick={() => onAdd('join')}>Join with a code</button></div>
    </motion.div>}

    {groups && groups.length > 0 && <div className="gcards">
      {groups.map((g, i) => <GroupCard key={g._id} g={g} cat={cat} i={i} streak={streaks[g._id]} onOpen={() => onOpen(g._id)} />)}
    </div>}
  </div>;
}
