// Shared browser helpers for every Photographicode page.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = p => '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });

export async function api(path, { method, body } = {}) {
  const m = method || (body ? 'POST' : 'GET');
  const r = await fetch(path, {
    method: m,
    headers: m !== 'GET' ? { 'Content-Type': 'application/json' } : {},
    body: m !== 'GET' ? JSON.stringify(body || {}) : undefined,
    credentials: 'same-origin',
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || `Request failed (${r.status})`); e.status = r.status; throw e; }
  return d;
}

export function toast(msg, kind = 'ok') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast ${kind}`; t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), 3800);
}
// Run an async action, show its error as a toast.
export const safely = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, 'err'); } };

export const ago = sqlUtc => {
  const s = Math.max(0, (Date.now() - new Date(sqlUtc.replace(' ', 'T') + 'Z')) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ${Math.floor(s % 3600 / 60)} m ago`;
};
export const clock = sqlUtc => new Date(sqlUtc.replace(' ', 'T') + 'Z').toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

// ---------- themes (guest menu + hotel website) ----------
export const THEMES = {
  leaf: { name: 'Banana Leaf', bg: '#f6f1e4', surface: '#fffdf7', text: '#1e2a1a', muted: '#66705f', brand: '#2f6b2f', accent: '#c8902e', font: 'Merriweather', radius: 14 },
  backwater: { name: 'Backwater Night', bg: '#0e1720', surface: '#16212c', text: '#e9eef2', muted: '#93a3b1', brand: '#3fb39a', accent: '#f2b84b', font: 'Poppins', radius: 16 },
  pastel: { name: 'Café Pastel', bg: '#fff5f0', surface: '#ffffff', text: '#2b2321', muted: '#7c6a64', brand: '#d9694f', accent: '#5f9c96', font: 'Poppins', radius: 20 },
  gold: { name: 'Fine Dine Gold', bg: '#0f0f0e', surface: '#1a1917', text: '#f2ebdd', muted: '#a59c8c', brand: '#c9a45c', accent: '#c9a45c', font: 'Playfair Display', radius: 6 },
  minimal: { name: 'Clean Minimal', bg: '#f7f7f5', surface: '#ffffff', text: '#141414', muted: '#6b6b6b', brand: '#141414', accent: '#e4572e', font: 'Inter', radius: 12 },
  spice: { name: 'Malabar Spice', bg: '#fbf3e6', surface: '#fffaf2', text: '#3a1d12', muted: '#7d5a48', brand: '#a3341c', accent: '#e0a43a', font: 'Manjari', radius: 14 },
  cloud: { name: 'Soft Cloud (3D)', bg: '#e6ebef', surface: '#e6ebef', text: '#1f2a33', muted: '#5d6b77', brand: '#2f7d62', accent: '#e07a3f', font: 'Poppins', radius: 18, neu: true },
  slate: { name: 'Soft Night (3D)', bg: '#272c33', surface: '#272c33', text: '#eef1f4', muted: '#a6b0ba', brand: '#4cc6a2', accent: '#f4b860', font: 'Poppins', radius: 18, neu: true },
};
// Perceived brightness: decides light/dark neumorphic shadows.
const isDark = hex => { const n = parseInt(String(hex).slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 110; };
export const FONTS = ['Inter', 'Poppins', 'Merriweather', 'Playfair Display', 'Manjari', 'Baloo Chettan 2'];

export function themeOf(t = {}) {
  return { ...(THEMES[t.preset] || THEMES.leaf), ...Object.fromEntries(Object.entries(t).filter(([, v]) => v !== '' && v != null)) };
}
export function applyTheme(t, el = document.documentElement) {
  const th = themeOf(t);
  for (const k of ['bg', 'surface', 'text', 'muted', 'brand', 'accent']) el.style.setProperty(`--${k}`, th[k]);
  el.style.setProperty('--radius', `${+th.radius || 12}px`);
  el.style.setProperty('--font', `'${th.font}', 'Noto Sans Malayalam', system-ui, sans-serif`);
  el.toggleAttribute('data-neu', !!th.neu);
  el.toggleAttribute('data-dark', isDark(th.bg));
  const id = 'font-' + th.font.replace(/\s/g, '');
  if (!document.getElementById(id)) {
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(th.font)}:wght@400;600;700&display=swap`;
    document.head.append(l);
  }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', th.brand);
  return th;
}

// Shrink photos in the browser before upload (phones take 4–12 MB pictures).
export function shrinkImage(file, max = 1000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}
export async function uploadImage(file, max) {
  return (await api('/api/upload', { body: { data: await shrinkImage(file, max) } })).url;
}

// Menu import: parse CSV or Excel copy-paste (tab separated) into dish rows, auto-matching headers.
export function parseTable(text) {
  const delim = text.includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') inQ = false; else cell += ch; }
    else if (ch === '"' && !cell) inQ = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
  if (!clean.length) return [];
  const head = clean[0].map(h => h.toLowerCase().replace(/^﻿/, ''));
  const col = re => head.findIndex(h => re.test(h));
  let c = { name: col(/item|dish|name|product/), category: col(/categ|group|section|menu/), price: col(/price|rate|mrp|amount|cost/), description: col(/desc|detail/), veg: col(/veg|type|diet|food/) };
  let body = clean.slice(1);
  if (c.name < 0 || c.price < 0) { c = { name: 0, price: clean[0].length > 2 ? 2 : 1, category: clean[0].length > 2 ? 1 : -1, description: -1, veg: -1 }; body = clean; } // no header: name, [category,] price
  if (c.category === c.name) c.category = -1;
  return body.map(r => ({ name: r[c.name], category: c.category >= 0 ? r[c.category] : '', price: r[c.price], description: c.description >= 0 ? r[c.description] : '',
    veg: c.veg >= 0 ? /^(veg|v|yes|1|true|vegetarian)$/i.test(r[c.veg]) : false })).filter(r => r.name && /\d/.test(r.price || ''));
}
