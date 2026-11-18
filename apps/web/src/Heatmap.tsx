import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { plural } from './ui';
import type { Day } from './types';

const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const monday0 = (d: string) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { ...o, timeZone: 'UTC' });
const WEEKS = 20; // The whole window fits the card, so there is no horizontal scroll to clip the first month.

/** First day shown in the heatmap window for a given "today". Shared with the Activity stats so both cover the same 20 weeks. */
export const heatmapStart = (today: string) => addDays(today, -monday0(today) - (WEEKS - 1) * 7);

export type Who = 'you' | 'group';
export function Heatmap({ days, today, who, members, games }: { days: Record<string, Day>; today: string; who: Who; members: number; games: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ d: string; x: number; y: number } | null>(null);
  const start = heatmapStart(today);

  const level = (d?: Day) => {
    const v = !d ? 0 : who === 'you' ? d.you / Math.max(games, 1) : d.players / Math.max(members, 1);
    return v <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(v * 4)));
  };
  const cells = useMemo(() => {
    const out: { d: string; col: number }[] = [];
    for (let i = 0; i < WEEKS * 7; i++) { const d = addDays(start, i); if (d > today) break; out.push({ d, col: Math.floor(i / 7) }); }
    return out;
  }, [start, today]);
  const labels = useMemo(() => {
    const out: { col: number; text: string }[] = []; let last = -9, prev = '';
    for (let c = 0; c < WEEKS; c++) { const d = addDays(start, c * 7), m = d.slice(0, 7); if (m !== prev && c - last >= 3) { out.push({ col: c, text: fmt(d, { month: 'short' }) }); last = c; } prev = m; }
    return out;
  }, [start]);

  const point = (e: SyntheticEvent) => {
    const t = (e.target as HTMLElement).closest('[data-d]') as HTMLElement | null, b = box.current;
    if (!t || !b) return setTip(null);
    const r = t.getBoundingClientRect(), br = b.getBoundingClientRect();
    setTip({ d: t.dataset.d!, x: Math.min(Math.max(r.left - br.left + r.width / 2, 70), br.width - 70), y: r.top - br.top });
  };
  const td = tip ? days[tip.d] : undefined;
  const tipText = !tip ? '' : who === 'you' ? `${td?.you ?? 0} of ${games} games` : `${td?.players ?? 0} of ${members} played${td?.group ? ` · ${td.group} results` : ''}`;
  const total = cells.filter(({ d }) => { const v = days[d]; return v && (who === 'you' ? v.you : v.players) > 0; }).length;

  return <div className="hm-card glass">
    <div className="hm-wrap">
      <div className="hm" ref={box} role="img" aria-label={`Activity heatmap, ${total} ${plural(total, 'active day')} in the last 20 weeks`} onPointerMove={(e) => e.pointerType !== 'touch' && point(e)} onPointerDown={point} onPointerLeave={() => setTip(null)}>
        <div className="hm-months">{labels.map((l) => <span key={l.col} style={{ gridColumn: l.col + 1 }}>{l.text}</span>)}</div>
        <div className="hm-body">
          <div className="hm-days"><span>Mon</span><span>Wed</span><span>Fri</span></div>
          <div className="hm-grid">{cells.map(({ d, col }) => <i key={d} data-d={d} className={`l${level(days[d])}${d === today ? ' now' : ''}`} style={{ ['--c' as any]: col }} />)}</div>
        </div>
        <AnimatePresence>{tip && <motion.div key="tip" className="hm-tip" style={{ left: tip.x, top: tip.y }} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          <b>{fmt(tip.d, { weekday: 'short', month: 'short', day: 'numeric' })}</b><span>{tipText}</span></motion.div>}</AnimatePresence>
      </div>
    </div>
  </div>;
}
