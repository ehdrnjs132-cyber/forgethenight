// FORGE THE NIGHT online service: accounts (guest or Google) and the best-enhancement ranking.
// The game itself stays a static site; this small API runs as its own Render web service.
//
//   npm run server          (http://127.0.0.1:8787)
//
// Environment (Render → Environment):
//   GOOGLE_CLIENT_ID  OAuth web client id (…apps.googleusercontent.com). Google sign-in is hidden without it.
//   DATABASE_URL      Postgres (Neon / Supabase / Render). Without it records live in a JSON file,
//                     which Render's free web service wipes on every restart.
//   ALLOWED_ORIGINS   Extra comma-separated origins allowed to call the API.
import crypto from 'node:crypto';
import express from 'express';
import { store } from './store.js';

const PORT = Number(process.env.PORT || 8787);
const clean = (v) => String(v || '').trim().replace(/^[A-Z_]+\s*=\s*/, '').replace(/^(['"])(.*)\1$/, '$2').trim();
const GOOGLE_CLIENT_ID = clean(process.env.GOOGLE_CLIENT_ID);
const ORIGINS = new Set([
  'https://forge-the-night.onrender.com',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  ...clean(process.env.ALLOWED_ORIGINS).split(',').map((s) => s.trim()).filter(Boolean),
]);
const MAX_LEVEL = 50;
const MAX_DEVICES = 10;
const RANK_SIZE = 50;
/**
 * Ranking season. Raising it wipes every best record once at start-up (accounts and names stay), and
 * records sent by clients built for an older season are ignored, so old bests cannot come back.
 * Season 2 = reset of 2026-11-19 (user request). The game's RANK_SEASON (src/online/account.ts) must match.
 */
const SEASON = 2;

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && ORIGINS.has(o)) {
    res.set('Access-Control-Allow-Origin', o);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
app.use(express.json({ limit: '8kb' }));

// Light abuse guard: 120 requests a minute per address.
const hits = new Map();
app.use((req, res, next) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) hits.set(ip, { t: now, n: 1 });
  else if (++h.n > 120) return res.status(429).json({ ok: false, error: 'slow-down' });
  next();
});
setInterval(() => hits.clear(), 10 * 60_000).unref();

const startedAt = Date.now();
app.get('/healthz', (_req, res) => res.send('ok'));
app.get('/config.json', (_req, res) => res.json({ googleClientId: GOOGLE_CLIENT_ID || null, season: SEASON }));
app.get('/status', (_req, res) =>
  res.json({
    storage: store.backend,
    players: [...store.entries('u:')].length,
    dbError: store.lastError,
    googleLogin: !!GOOGLE_CLIENT_ID,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
  }),
);

// ───────────────────────── accounts

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newId = () => crypto.randomBytes(8).toString('hex');
const newToken = () => crypto.randomBytes(24).toString('base64url');

function cleanName(n) {
  const s = String(n || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  return s.length >= 2 ? s : null;
}

/** The account a request speaks for, or null. */
function auth(body) {
  const uid = String(body?.uid || '');
  const token = String(body?.token || '');
  const u = uid && store.get(`u:${uid}`);
  return u && token && u.tokens.includes(sha(token)) ? u : null;
}

function issueToken(u) {
  const token = newToken();
  u.tokens = [sha(token), ...u.tokens].slice(0, MAX_DEVICES);
  return token;
}

const view = (u) => ({ uid: u.uid, name: u.name, google: !!u.google, best: u.best || null });

async function verifyGoogle(credential) {
  if (!GOOGLE_CLIENT_ID || typeof credential !== 'string' || credential.length > 4096) return null;
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!r.ok) return null;
    const info = await r.json();
    const issOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
    if (info.aud !== GOOGLE_CLIENT_ID || !issOk || Number(info.exp) * 1000 < Date.now() || !info.sub) return null;
    return { sub: String(info.sub), gname: info.given_name || info.name || '' };
  } catch {
    return null;
  }
}

// Guest: nickname only. The token stays in the browser; the server keeps only its hash.
app.post('/api/guest', (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ ok: false, error: 'name' });
  const u = { uid: newId(), name, google: null, tokens: [], best: null, created: Date.now() };
  const token = issueToken(u);
  store.set(`u:${u.uid}`, u);
  res.json({ ok: true, token, user: view(u) });
});

// Google: an account already linked to this Google id opens on this device; otherwise the current guest
// profile (if any) is linked, or a new one is made. Only Google's account number (sub) is stored.
app.post('/api/google', async (req, res) => {
  const g = await verifyGoogle(req.body?.credential);
  if (!g) return res.status(401).json({ ok: false, error: 'google' });
  const linked = store.get(`g:${g.sub}`);
  let u = linked ? store.get(`u:${linked}`) : null;
  let switched = false;
  if (u) switched = req.body?.uid !== u.uid;
  else {
    u = auth(req.body);
    if (u && u.google) u = null; // that profile belongs to another Google account
    if (!u) u = { uid: newId(), name: cleanName(g.gname) || `earth ${1 + crypto.randomInt(999)}`, google: null, tokens: [], best: null, created: Date.now() };
    u.google = g.sub;
    store.set(`g:${g.sub}`, u.uid);
  }
  const token = issueToken(u);
  store.set(`u:${u.uid}`, u);
  res.json({ ok: true, token, switched, user: view(u) });
});

app.post('/api/me', (req, res) => {
  const u = auth(req.body);
  if (!u) return res.status(401).json({ ok: false, error: 'auth' });
  res.json({ ok: true, user: view(u) });
});

app.post('/api/name', (req, res) => {
  const u = auth(req.body);
  const name = cleanName(req.body?.name);
  if (!u) return res.status(401).json({ ok: false, error: 'auth' });
  if (!name) return res.status(400).json({ ok: false, error: 'name' });
  u.name = name;
  store.set(`u:${u.uid}`, u);
  res.json({ ok: true, user: view(u) });
});

// A new personal best. Only ever goes up. (The game runs in the browser, so this trusts the client.)
app.post('/api/record', (req, res) => {
  const u = auth(req.body);
  if (!u) return res.status(401).json({ ok: false, error: 'auth' });
  // a game built before this season would re-send an old best: accept nothing from it
  if (Number(req.body?.season) !== SEASON) return res.json({ ok: true, stale: true, user: view(u) });
  const level = Math.floor(Number(req.body?.level));
  if (!Number.isFinite(level) || level < 0 || level > MAX_LEVEL) return res.status(400).json({ ok: false, error: 'level' });
  const weapon = String(req.body?.weapon || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 30);
  const day = Math.max(1, Math.min(9999, Math.floor(Number(req.body?.day) || 1)));
  if (!u.best || level > u.best.level) {
    u.best = { level, weapon, day, at: Date.now() };
    store.set(`u:${u.uid}`, u);
  }
  res.json({ ok: true, user: view(u) });
});

app.get('/api/ranking', (req, res) => {
  const all = [];
  for (const [, u] of store.entries('u:')) if (u.best) all.push(u);
  all.sort((a, b) => b.best.level - a.best.level || a.best.at - b.best.at);
  const top = all.slice(0, RANK_SIZE).map((u, i) => ({ rank: i + 1, uid: u.uid, name: u.name, google: !!u.google, ...u.best }));
  const meId = String(req.query.uid || '');
  const idx = meId ? all.findIndex((u) => u.uid === meId) : -1;
  const me = idx >= 0 ? { rank: idx + 1, uid: meId, name: all[idx].name, ...all[idx].best } : null;
  res.json({ ok: true, total: all.length, top, me });
});

await store.init().catch((e) => console.error('store init failed', e.message));

// New season: clear every best record once (accounts, names and sign-ins stay).
if ((store.get('meta:season') ?? 1) < SEASON) {
  let cleared = 0;
  for (const [k, u] of [...store.entries('u:')]) {
    if (!u.best) continue;
    store.set(k, { ...u, best: null });
    cleared++;
  }
  store.set('meta:season', SEASON);
  console.log(`Ranking season ${SEASON}: cleared ${cleared} records`);
}
app.listen(PORT, () => console.log(`FORGE THE NIGHT online on :${PORT} (google ${GOOGLE_CLIENT_ID ? 'on' : 'off'})`));
