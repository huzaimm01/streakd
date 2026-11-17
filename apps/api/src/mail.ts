import nodemailer from 'nodemailer';
import { cfg } from './config.ts';

/** Sends via SMTP_URL (e.g. smtps://user:pass@host). With no SMTP configured, logs the message so self-hosters can copy the link. */
export async function sendMail(to: string, subject: string, text: string) {
  if (!cfg.smtpUrl) { console.log(`[mail disabled] to=${to} subject=${subject}\n${text}`); return; }
  try { await nodemailer.createTransport(cfg.smtpUrl).sendMail({ from: cfg.mailFrom, to, subject, text }); }
  catch (e) { console.error('mail failed', e); } // never reveal delivery failures to the caller
}
