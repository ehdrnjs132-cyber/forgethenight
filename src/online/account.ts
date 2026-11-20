// Online account (guest nickname or Google) and the best-level ranking. Talks to server/index.js.
// Everything here is optional: if the server is asleep or unreachable the game plays on offline.

export interface User {
  uid: string;
  name: string;
  google: boolean;
  best: { level: number; weapon: string; day: number; at: number } | null;
}

export interface RankRow {
  rank: number;
  uid: string;
  name: string;
  google?: boolean;
  level: number;
  weapon: string;
  day: number;
}

/**
 * Ranking season; must match SEASON in server/index.js. Season 2 started with the reset of 2026-11-19:
 * only enhancements made from then on count (see seasonBest).
 */
export const RANK_SEASON = 2;
const SEASON_KEY = 'ftn.seasonBest';

/** This device's best of the current season (the lifetime best in records may be from an old season). */
export function seasonBest(): { level: number; weapon: string } {
  try {
    const v = JSON.parse(localStorage.getItem(SEASON_KEY) || 'null');
    if (v && v.season === RANK_SEASON) return { level: Number(v.level) || 0, weapon: String(v.weapon || '') };
  } catch {
    /* ignore */
  }
  return { level: 0, weapon: '' };
}

export function noteSeasonBest(level: number, weapon: string): void {
  if (level <= seasonBest().level) return;
  try {
    localStorage.setItem(SEASON_KEY, JSON.stringify({ season: RANK_SEASON, level, weapon }));
  } catch {
    /* ignore */
  }
}

const KEY = 'ftn.account';
const SKIP_KEY = 'ftn.account.skip';

/** API base: VITE_API_URL at build time, the local server in dev, else the Render service. */
export const API: string =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://127.0.0.1:8787' : 'https://forge-the-night-api.onrender.com');

interface Saved {
  uid: string;
  token: string;
  user: User;
}

function read(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && v.uid && v.token ? v : null;
  } catch {
    return null;
  }
}

function write(v: Saved | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: stays signed in for this page only */
  }
}

let saved = read();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

export const account = {
  get user(): User | null {
    return saved?.user ?? null;
  },
  onChange(fn: () => void) {
    listeners.add(fn);
  },
  offChange(fn: () => void) {
    listeners.delete(fn);
  },
  get skipped(): boolean {
    try {
      return localStorage.getItem(SKIP_KEY) === '1';
    } catch {
      return false;
    }
  },
  skip() {
    try {
      localStorage.setItem(SKIP_KEY, '1');
    } catch {
      /* ignore */
    }
  },
};

async function call<T>(path: string, body?: unknown, timeoutMs = 40_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await r.json();
    if (!r.ok || data.ok === false) throw Object.assign(new Error(data.error || `http ${r.status}`), { code: data.error });
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

const creds = () => (saved ? { uid: saved.uid, token: saved.token } : {});

/** Signed-in account's id and token (for the duel connection), or null. */
export function accountCreds(): { uid: string; token: string } | null {
  return saved ? { uid: saved.uid, token: saved.token } : null;
}

/** A throwaway guest identity that is NOT saved (test slot only: two tabs can duel each other). */
export async function tempGuest(name: string): Promise<{ uid: string; token: string }> {
  const r = await call<{ token: string; user: User }>('/api/guest', { name });
  return { uid: r.user.uid, token: r.token };
}

function adopt(token: string, user: User) {
  saved = { uid: user.uid, token, user };
  write(saved);
  changed();
}

export async function serverConfig(): Promise<{ googleClientId: string | null }> {
  return call('/config.json', undefined, 45_000);
}

export async function startGuest(name: string): Promise<User> {
  const r = await call<{ token: string; user: User }>('/api/guest', { name });
  adopt(r.token, r.user);
  return r.user;
}

export async function googleLogin(credential: string): Promise<{ user: User; switched: boolean }> {
  const r = await call<{ token: string; user: User; switched: boolean }>('/api/google', { credential, ...creds() });
  adopt(r.token, r.user);
  return r;
}

export async function rename(name: string): Promise<User> {
  const r = await call<{ user: User }>('/api/name', { ...creds(), name });
  adopt(saved!.token, r.user);
  return r.user;
}

export function signOut() {
  saved = null;
  write(null);
  changed();
}

/** Refresh the cached profile (also tells us if the token was revoked). */
export async function refreshMe(): Promise<void> {
  if (!saved) return;
  try {
    const r = await call<{ user: User }>('/api/me', creds());
    adopt(saved.token, r.user);
  } catch (e) {
    if ((e as { code?: string }).code === 'auth') signOut();
  }
}

let sending = false;
/** Report a new personal best; ignored when it is not higher than what the server has. */
export async function submitBest(level: number, weapon: string, day: number): Promise<void> {
  if (!saved || sending) return;
  if (saved.user.best && saved.user.best.level >= level) return;
  sending = true;
  try {
    const r = await call<{ user: User }>('/api/record', { ...creds(), level, weapon, day, season: RANK_SEASON });
    adopt(saved.token, r.user);
  } catch {
    /* offline: the next best (or the next launch) tries again */
  } finally {
    sending = false;
  }
}

export async function ranking(): Promise<{ total: number; top: RankRow[]; me: RankRow | null }> {
  return call(`/api/ranking${saved ? `?uid=${saved.uid}` : ''}`);
}
