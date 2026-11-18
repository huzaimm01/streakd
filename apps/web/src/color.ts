import type { Mode } from './types';

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
export const rgba = (hex: string, a: number) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

interface HSL { h: number; s: number; l: number }
export function hexToHsl(hex: string): HSL {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2; let h = 0, s = 0;
  if (max !== min) {
    const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return { h, s, l };
}
export function hslToHex({ h, s, l }: HSL) {
  const a = s * Math.min(l, 1 - l), k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
const lum = (hex: string) => { const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const onColor = (hex: string) => (lum(hex) > 0.4 ? '#0b0f1a' : '#ffffff');

export interface Palette { bg: string; fg: string; accent: string; onAccent: string; orbs: string[] }

/**
 * Turn a group's two raw colours into a readable palette for the current mode.
 * Whatever the group picks, the background stays dark (or light) enough for text and the accent stays visible.
 */
export function palette(main: string, accent: string, mode: Mode): Palette {
  const m = hexToHsl(main), a = hexToHsl(accent);
  if (mode === 'dark') {
    // Flat surfaces now: one solid background for every group, no glow orbs.
    // The group's colours still show up in its card strip, heatmap and ring, via the accent.
    const acc = a.l >= 0.6 ? accent : hslToHex({ ...a, l: 0.68 });
    return { bg: '#182238', fg: '#f3f5fb', accent: acc, onAccent: onColor(acc), orbs: [] };
  }
  const acc = a.l <= 0.45 ? accent : hslToHex({ h: m.h, s: clamp(m.s, 0.35, 0.9), l: clamp(m.l, 0.28, 0.4) });
  return { bg: hslToHex({ h: m.h, s: Math.min(m.s, 0.5) * 0.6, l: 0.955 }), fg: hslToHex({ h: m.h, s: 0.35, l: 0.12 }), accent: acc, onAccent: onColor(acc),
    orbs: [acc, hslToHex({ h: m.h, s: 0.7, l: 0.8 }), acc] };
}

export function applyPalette(p: Palette, mode: Mode) {
  const root = document.documentElement, s = root.style;
  s.setProperty('--bg', p.bg); s.setProperty('--fg', p.fg); s.setProperty('--accent', p.accent); s.setProperty('--on-accent', p.onAccent);
  s.setProperty('--accent-soft', rgba(p.accent, 0.16)); s.setProperty('--mute', rgba(p.fg, 0.62)); s.setProperty('--line', rgba(p.fg, 0.12));
  s.setProperty('--field', rgba(p.fg, 0.06));
  root.dataset.mode = mode; document.body.style.background = p.bg;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', p.bg);
}

/** The app's own palette when no group is selected: flat midnight navy, navy accent. */
export function defaultPalette(mode: Mode): Palette {
  const accent = '#4a7de0';
  if (mode === 'dark') return { bg: '#182238', fg: '#f3f5fb', accent, onAccent: onColor(accent), orbs: [] };
  return palette('#58647E', accent, 'light');
}

/** Colour pairs offered when creating or restyling a group: [background, accent]. */
export const PRESETS: [string, string][] = [
  ['#0f1b3d', '#ffffff'], ['#2b1020', '#ff7a59'], ['#0d2a22', '#5eead4'], ['#0a1f44', '#4a7de0'],
  ['#08243a', '#38bdf8'], ['#2a0f1c', '#fb7185'], ['#2a2008', '#fbbf24'], ['#17181c', '#a3e635'],
];
