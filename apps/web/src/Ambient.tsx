import { motion } from 'framer-motion';

/** Fixed backdrop: a base colour plus slow-drifting colour orbs. The glass cards blur these, which is what makes them look like glass. */
export function Ambient({ bg, orbs }: { bg: string; orbs: string[] }) {
  const list = orbs.length ? orbs : ['#4f5dff'];
  return <div className="ambient" aria-hidden="true">
    <motion.div className="ambient-base" initial={false} animate={{ backgroundColor: bg }} transition={{ duration: 0.8 }} />
    {[0, 1, 2, 3].map((i) => <motion.span key={i} className={`orb orb-${i}`} initial={false} animate={{ backgroundColor: list[i % list.length] }} transition={{ duration: 0.9 }} />)}
  </div>;
}
