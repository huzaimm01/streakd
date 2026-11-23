const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Missing env var ${k}`); return v; };
const secret = need('JWT_SECRET');
if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
export const cfg = {
  port: Number(process.env.PORT || 4000),
  mongo: need('MONGODB_URI'),
  jwtSecret: secret,
  cors: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8080').split(',').map((s) => s.trim()),
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'strict' | 'none',
  accessTtl: process.env.ACCESS_TTL || '15m',
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  // Render (and any reverse proxy) sets X-Forwarded-For. Fastify only trusts
  // it when trustProxy is on; without it req.ip is the proxy's address, so
  // every client shares one rate-limit bucket (10 logins/min TOTAL, and one
  // attacker can lock everyone out). render.yaml sets TRUST_PROXY=true.
  trustProxy: process.env.TRUST_PROXY === 'true',
  smtpUrl: process.env.SMTP_URL || '',
  mailFrom: process.env.MAIL_FROM || 'Streak’d <no-reply@localhost>',
  refreshDays: Number(process.env.REFRESH_DAYS || 30),
};
