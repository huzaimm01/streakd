import { AnimatePresence, animate, motion, useDragControls, useIsPresent } from 'framer-motion';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Theme } from './types';

// ---------------------------------------------------------------- icons
const C = (p: { cx: number; cy: number; r: number }) => <circle {...p} />;
const ICONS: Record<string, ReactNode> = {
  back: <path d="M15 18l-6-6 6-6" />, next: <path d="M9 18l6-6-6-6" />, plus: <path d="M12 5v14M5 12h14" />, check: <path d="M20 6L9 17l-5-5" />,
  x: <path d="M18 6L6 18M6 6l12 12" />, more: <><C cx={5} cy={12} r={1.2} /><C cx={12} cy={12} r={1.2} /><C cx={19} cy={12} r={1.2} /></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
  crown: <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />, trophy: <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z" />,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /><C cx={9} cy={7} r={4} /></>,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><C cx={12} cy={7} r={4} /></>,
  invite: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M19 8v6M22 11h-6" /><C cx={9} cy={7} r={4} /></>,
  sliders: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  'grid-3x3': <><rect x={3} y={3} width={18} height={18} rx={2} /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>,
  link: <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />,
  'link-2': <path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8" />,
  globe: <><C cx={12} cy={12} r={10} /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
  earth: <><C cx={12} cy={12} r={10} /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
  flag: <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />,
  triangle: <path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z" />,
  target: <><C cx={12} cy={12} r={10} /><C cx={12} cy={12} r={6} /><C cx={12} cy={12} r={2} /></>,
  sprout: <path d="M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />,
  sparkles: <path d="M12 3l2.2 6.3L20.5 12l-6.3 2.7L12 21l-2.2-6.3L3.5 12l6.3-2.7z" />,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  sun: <><C cx={12} cy={12} r={4} /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>,
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />,
  monitor: <><rect x={2} y={3} width={20} height={14} rx={2} /><path d="M8 21h8M12 17v4" /></>,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  copy: <><rect x={8} y={8} width={14} height={14} rx={2} /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>,
  trash: <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />,
  external: <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />,
};
export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name] ?? ICONS.sparkles}</svg>;
}

// ---------------------------------------------------------------- hooks
export function useMedia(q: string) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => { const l = matchMedia(q), f = () => setM(l.matches); l.addEventListener('change', f); return () => l.removeEventListener('change', f); }, [q]);
  return m;
}
/** Run an async action with error + busy state. */
export function useAction() {
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>) => { setErr(''); setBusy(true); try { await fn(); } catch (e: any) { setErr(e.message); } setBusy(false); }, []);
  return { err, busy, run, setErr };
}
export function CountUp({ value }: { value: number }) {
  const [v, setV] = useState(0);
  useEffect(() => { const c = animate(0, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => setV(Math.round(x)) }); return () => c.stop(); }, [value]);
  return <>{v}</>;
}

// ---------------------------------------------------------------- small pieces
export const Err = ({ e }: { e: string }) => (e ? <p className="err" role="alert">{e}</p> : null);

export function Btn({ variant = 'glass', busy, className = '', children, ...r }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'glass' | 'danger' | 'quiet'; busy?: boolean }) {
  return <button {...r} className={`btn ${variant} ${className}`} data-busy={busy || undefined} disabled={r.disabled || busy}>{children}</button>;
}

/** "1 game" / "2 games", "1 active day" / "3 active days" — hardcoded plurals read as a rush job. */
export const plural = (n: number, one: string, many?: string) => (n === 1 ? one : many ?? one + 's');
export function ConfirmBtn({ children, onConfirm, className = '', label = 'Tap again to confirm', disabled }: { children: ReactNode; onConfirm: () => void; className?: string; label?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return <Btn variant="danger" className={className} disabled={disabled} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>{armed ? label : children}</Btn>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className="switch" data-on={on} onClick={() => onChange(!on)}><motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} /></button>;
}

export function Segmented<const T extends string>({ id, options, value, onChange, small }: { id: string; options: { id: T; label?: string; icon?: string }[]; value: T; onChange: (v: T) => void; small?: boolean }) {
  return <div className={'seg' + (small ? ' small' : '')} role="tablist">{options.map((o) => (
    <button key={o.id} role="tab" aria-selected={value === o.id} aria-label={o.label ?? o.id} className="seg-btn" onClick={() => onChange(o.id)}>
      {value === o.id && <motion.span layoutId={`seg-${id}`} className="seg-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
      <span className="seg-label">{o.icon && <Icon name={o.icon} size={16} />}{o.label}</span>
    </button>))}</div>;
}

export const ThemeSwitch = ({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) => (
  <Segmented id="theme" small value={theme} onChange={setTheme} options={[{ id: 'system', icon: 'monitor' }, { id: 'light', icon: 'sun' }, { id: 'dark', icon: 'moon' }]} />
);

/** The group's two colours as a line: background colour + accent colour. */
export function ColorLine({ main, accent, delay = 0 }: { main: string; accent: string; delay?: number }) {
  return <motion.span className="cline" aria-hidden="true" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.25 + delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}><i style={{ background: main }} /><i style={{ background: accent }} /></motion.span>;
}

export const Avatar = ({ name, size = 36 }: { name: string; size?: number }) => (
  <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>{(name || '?').trim()[0]?.toUpperCase()}</span>
);

// ---------------------------------------------------------------- toast
const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const push = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random(); setItems((i) => [...i.slice(-2), { id, msg, kind }]);
    setTimeout(() => setItems((i) => i.filter((x) => x.id !== id)), 3200);
  }, []);
  return <ToastCtx.Provider value={push}>{children}
    <div className="toasts" aria-live="polite"><AnimatePresence>{items.map((t) => (
      <motion.div key={t.id} layout className={'toast ' + t.kind} initial={{ opacity: 0, y: 24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>{t.msg}</motion.div>))}</AnimatePresence></div>
  </ToastCtx.Provider>;
}

// ---------------------------------------------------------------- sheet (bottom sheet on phones, modal on desktop)
// An AnimatePresence child stays mounted (invisible) while its exit animation
// runs, so a closing overlay would still take clicks — the group menu's theme
// switcher flipped the theme after the menu had visually closed. useIsPresent
// is false exactly while exiting, so pointer events go off the moment it
// starts closing.
function SheetRoot({ children }: { children: ReactNode }) {
  const isPresent = useIsPresent();
  return <div className="sheet-root" style={{ pointerEvents: isPresent ? undefined : 'none' }}>{children}</div>;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const mobile = useMedia('(max-width: 640px)'); const drag = useDragControls(); const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key); document.body.style.overflow = 'hidden'; panel.current?.focus();
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open]);
  return <AnimatePresence>{open && (
    <SheetRoot>
      <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="sheet grain"
        initial={mobile ? { y: '100%' } : { opacity: 0, y: 24, scale: 0.97 }} animate={mobile ? { y: '0%' } : { opacity: 1, y: 0, scale: 1 }} exit={mobile ? { y: '100%' } : { opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        drag={mobile ? 'y' : false} dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_, i) => (i.offset.y > 110 || i.velocity.y > 600) && onClose()}>
        <div className="grab" onPointerDown={(e) => drag.start(e)}><span /></div>
        <div className="sheet-head"><h2>{title}</h2><button className="icon-btn quiet" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="sheet-body">{children}</div>
      </motion.div>
    </SheetRoot>)}</AnimatePresence>;
}

// ---------------------------------------------------------------- menu (hidden until opened)
export type MenuItem = 'divider' | { label: string; icon: string; onClick: () => void; danger?: boolean; hidden?: boolean };
function MenuPop({ top, items, onPick }: { top?: ReactNode; items: MenuItem[]; onPick: (it: Exclude<MenuItem, 'divider'>) => void }) {
  const isPresent = useIsPresent();
  return (
    <motion.div role="menu" className="menu-pop" style={{ transformOrigin: 'top right', pointerEvents: isPresent ? 'auto' : 'none' }} initial={{ opacity: 0, scale: 0.9, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }} transition={{ type: 'spring', stiffness: 520, damping: 34 }}>
      {top && <div className="menu-top">{top}</div>}
      {items.map((i, n) => i === 'divider' ? <hr key={n} /> : (
        <button key={i.label} role="menuitem" className={'menu-item' + (i.danger ? ' danger' : '')} onClick={() => onPick(i)}><Icon name={i.icon} size={18} />{i.label}</button>))}
    </motion.div>);
}
export function Menu({ label, trigger, items, top }: { label: string; trigger: ReactNode; items: MenuItem[]; top?: ReactNode }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false), key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const shown = items.filter((i) => i === 'divider' || !i.hidden).filter((i, n, a) => !(i === 'divider' && (n === 0 || a[n - 1] === 'divider' || n === a.length - 1)));
  const nav = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const els = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []); const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus(); e.preventDefault();
  };
  return <div className="menu" ref={ref} onKeyDown={nav}>
    <motion.button className="icon-btn glass" aria-label={label} aria-haspopup="menu" aria-expanded={open} whileTap={{ scale: 0.9 }} onClick={() => setOpen((o) => !o)}>{trigger}</motion.button>
    <AnimatePresence>{open && <MenuPop top={top} items={shown} onPick={(it) => { setOpen(false); it.onClick(); }} />}</AnimatePresence>
  </div>;
}
