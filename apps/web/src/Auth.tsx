import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type FormEvent } from 'react';
import { api, setToken } from './api';
import { Btn, Err, Field, Icon, useAction } from './ui';
import type { User } from './types';

type Mode = 'login' | 'register' | 'forgot' | 'reset';
const TITLE: Record<Mode, [string, string]> = {
  login: ['Welcome back', 'Log in to see how your groups are doing.'], register: ['Create your account', 'Takes ten seconds. Then invite your friends.'],
  forgot: ['Reset password', 'We’ll email you a link.'], reset: ['New password', 'Choose something you’ll remember.'],
};

export function Auth({ onAuth }: { onAuth: (u: User) => void }) {
  const resetToken = location.hash.match(/token=([a-f0-9]+)/)?.[1];
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'login');
  const [f, setF] = useState({ email: '', password: '', displayName: '', signupCode: '' }); const [note, setNote] = useState('');
  // Friends-only signup: the invite-code field only appears when the API says
  // a code is required. If the API is older than the gate (or unreachable),
  // this stays false and registration behaves exactly as before.
  const [codeRequired, setCodeRequired] = useState(false);
  useEffect(() => { api('GET', '/config').then((c) => setCodeRequired(!!c.signupCodeRequired)).catch(() => {}); }, []);
  const { err, busy, run, setErr } = useAction();
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const go = (m: Mode) => { setMode(m); setErr(''); setNote(''); };
  const submit = (e: FormEvent) => { e.preventDefault(); run(async () => {
    if (mode === 'forgot') { await api('POST', '/auth/forgot', { email: f.email }); setNote('If that email has an account, a reset link is on its way.'); return; }
    if (mode === 'reset') { await api('POST', '/auth/reset', { token: resetToken, password: f.password }); history.replaceState(null, '', location.pathname); go('login'); setNote('Password changed. Log in with your new password.'); return; }
    const r = await api('POST', mode === 'login' ? '/auth/login' : '/auth/register', f); setToken(r.accessToken); onAuth(r.user);
  }); };
  return <div className="auth">
    <motion.div className="brand" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}><span className="brand-mark"><Icon name="flame" size={22} /></span>Streak’d</motion.div>
    <motion.form className="glass auth-card" onSubmit={submit} initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 20, delay: 0.08 }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={mode} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.18 }}>
          <h1>{TITLE[mode][0]}</h1><p className="mute lede">{TITLE[mode][1]}</p>
          {mode === 'register' && <Field label="Display name"><input className="input" value={f.displayName} onChange={set('displayName')} required maxLength={40} autoComplete="nickname" /></Field>}
          {mode !== 'reset' && <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></Field>}
          {mode !== 'forgot' && <Field label={mode === 'reset' ? 'New password' : 'Password'}><input className="input" type="password" value={f.password} onChange={set('password')} required minLength={8} placeholder="8+ characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>}
          {mode === 'register' && codeRequired && <Field label="Invite code"><input className="input" value={f.signupCode} onChange={set('signupCode')} required placeholder="Ask a friend for the code" autoComplete="off" /></Field>}
          <Err e={err} />{note && <p className="ok">{note}</p>}
          <Btn variant="primary" className="block" busy={busy}>{{ login: 'Log in', register: 'Create account', forgot: 'Send reset link', reset: 'Change password' }[mode]}</Btn>
          <p className="mute switchline">{mode === 'login'
            ? <><button type="button" className="link" onClick={() => go('register')}>Create an account</button><span>·</span><button type="button" className="link" onClick={() => go('forgot')}>Forgot password?</button></>
            : <button type="button" className="link" onClick={() => go('login')}>Back to log in</button>}</p>
        </motion.div>
      </AnimatePresence>
    </motion.form>
  </div>;
}
