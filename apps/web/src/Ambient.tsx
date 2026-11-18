import { motion } from 'framer-motion';

/** Fixed backdrop: a flat base colour. The colour orbs are gone with the glass look; when a palette carries none, nothing drifts behind the app. */
export function Ambient({ bg, orbs }: { bg: string; orbs: string[] }) {
  return <div className="ambient" aria-hidden="true">
    <motion.div className="ambient-base" initial={false} animate={{ backgroundColor: bg }} transition={{ duration: 0.8 }} />
    {orbs.length ? [0, 1, 2, 3].map((i) => <motion.span key={i} className={`orb orb-${i}`} initial={false} animate={{ backgroundColor: orbs[i % orbs.length] }} transition={{ duration: 0.9 }} />) : null}
  </div>;
}
