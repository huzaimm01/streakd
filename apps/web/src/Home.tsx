import { motion, useSpring } from 'framer-motion';
import type { PointerEvent } from 'react';
import { Avatar, ColorLine, Icon, Menu, ThemeSwitch } from './ui';
import type { Group, Theme, User } from './types';

const hello = () => { const h = new Date().getHours(); return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

function GroupCard({ g, i, streak, onOpen }: { g: Group; i: number; streak?: number; onOpen: () => void }) {
  const rx = useSpring(0, { stiffness: 220, damping: 20 }), ry = useSpring(0, { stiffness: 220, damping: 20 });
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    ry.set((x - 0.5) * 9); rx.set(-(y - 0.5) * 9);
    e.currentTarget.style.setProperty('--mx', `${x * 100}%`); e.currentTarget.style.setProperty('--my', `${y * 100}%`);
  };
  const games = g.games.filter((x) => x.active).length;
  return <motion.div initial={{ opacity: 0, y: 34, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.12 + i * 0.08, type: 'spring', stiffness: 130, damping: 17 }}>
    <div className="float" style={{ ['--fd' as any]: `${6 + (i % 3) * 1.4}s`, ['--fl' as any]: `${-i * 1.9}s`, ['--fa' as any]: i % 2 ? '7px' : '-7px' }}>
      <span className="gcard-orb" style={{ background: `radial-gradient(circle at 30% 30%, ${g.accentColor} 0%, transparent 62%), radial-gradient(circle at 80% 80%, ${g.mainColor} 0%, transparent 60%)` }} />
      <motion.button className="glass gcard" style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
        onPointerMove={move} onPointerLeave={() => { rx.set(0); ry.set(0); }} onClick={onOpen} aria-label={`Open ${g.name}`}>
        <span className="gcard-top">
          <span className="chip">{g.role}</span>
          {streak ? <span className="chip flame"><Icon name="flame" size={14} />{streak}</span> : null}
        </span>
        <h3>{g.name}</h3>
        <p className="mute">{g.description || `${games} games · ${g.timezone.replace('_', ' ')}`}</p>
        <ColorLine main={g.mainColor} accent={g.accentColor} delay={i * 0.08} />
      </motion.button>
    </div>
  </motion.div>;
}

export function Home({ user, groups, streaks, theme, setTheme, onOpen, onAdd, onAccount, onLogout }: {
  user: User; groups: Group[] | null; streaks: Record<string, number>; theme: Theme; setTheme: (t: Theme) => void;
  onOpen: (id: string) => void; onAdd: (tab: 'create' | 'join') => void; onAccount: () => void; onLogout: () => void;
}) {
  const first = user.displayName.split(' ')[0];
  return <div className="page">
    <header className="top">
      <span className="brand sm"><span className="brand-mark"><Icon name="flame" size={16} /></span>Streak’d</span>
      <Menu label="Menu" trigger={<Avatar name={user.displayName} size={34} />} top={<ThemeSwitch theme={theme} setTheme={setTheme} />}
        items={[{ label: 'Account', icon: 'user', onClick: onAccount }, { label: 'New group', icon: 'plus', onClick: () => onAdd('create') }, { label: 'Join with a code', icon: 'invite', onClick: () => onAdd('join') }, 'divider', { label: 'Log out', icon: 'logout', onClick: onLogout }]} />
    </header>

    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <h1 className="greet">{hello()},<br /><span className="grad">{first}</span></h1>
      <p className="mute sub">{groups && groups.length ? 'Pick up where you left off.' : 'Let’s get your first league going.'}</p>
    </motion.div>

    {groups === null && <div className="gcards">{[0, 1, 2].map((i) => <div key={i} className="glass gcard skeleton" />)}</div>}

    {groups && groups.length === 0 && <motion.div className="glass empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
      <span className="empty-ico"><Icon name="flame" size={30} /></span>
      <h2>Start a streak with friends</h2><p className="mute">Create a group for your daily puzzles, or join one with an invite code.</p>
      <div className="row-actions"><button className="btn primary" onClick={() => onAdd('create')}><Icon name="plus" size={18} />Create a group</button><button className="btn glass" onClick={() => onAdd('join')}>Join with a code</button></div>
    </motion.div>}

    {groups && groups.length > 0 && <div className="gcards">
      {groups.map((g, i) => <GroupCard key={g._id} g={g} i={i} streak={streaks[g._id]} onOpen={() => onOpen(g._id)} />)}
      <motion.button className="addcard" onClick={() => onAdd('create')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + groups.length * 0.08 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
        <Icon name="plus" size={22} /><span>New group</span>
      </motion.button>
    </div>}
  </div>;
}
