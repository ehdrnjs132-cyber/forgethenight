// Tiny key-value store (same idea as the poker server): everything in memory for fast reads, every write
// persisted to Postgres when DATABASE_URL is set, otherwise to a JSON file. Uses its own table
// `ftn_kv`, so the same database can be shared with other games safely.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = process.env.DATA_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'store.json');

function cleanUrl(u) {
  u = String(u || '').trim().replace(/^DATABASE_URL\s*=\s*/i, '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
  try {
    const url = new URL(u);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('channel_binding');
    return url.toString();
  } catch {
    return u;
  }
}

class Store {
  constructor() {
    this.data = new Map();
    this.backend = process.env.DATABASE_URL ? 'postgres' : 'file';
    this.pool = null;
    this.writeTimer = null;
    this.lastError = null;
  }

  async init() {
    if (this.backend === 'postgres') {
      try {
        const { default: pg } = await import('pg');
        const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL);
        this.pool = new pg.Pool({ connectionString: cleanUrl(process.env.DATABASE_URL), ssl: local ? false : { rejectUnauthorized: false }, max: 5, connectionTimeoutMillis: 15000 });
        this.pool.on('error', (e) => (this.lastError = e.message));
        await this.pool.query('CREATE TABLE IF NOT EXISTS ftn_kv (k TEXT PRIMARY KEY, v JSONB NOT NULL)');
        const { rows } = await this.pool.query('SELECT k, v FROM ftn_kv');
        for (const r of rows) this.data.set(r.k, r.v);
      } catch (e) {
        this.lastError = e.message;
        this.pool = null;
        this.backend = 'file';
        this.loadFile();
      }
    } else this.loadFile();
    console.log(`Store: ${this.backend}, ${this.data.size} records`);
  }

  loadFile() {
    try {
      for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8')))) this.data.set(k, v);
    } catch {
      /* first run */
    }
  }

  get(k) {
    return this.data.get(k);
  }

  set(k, v) {
    this.data.set(k, v);
    if (this.pool) {
      this.pool
        .query('INSERT INTO ftn_kv (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v', [k, JSON.stringify(v)])
        .catch((e) => (this.lastError = e.message));
    } else this.scheduleFileWrite();
  }

  *entries(prefix) {
    for (const [k, v] of this.data) if (k.startsWith(prefix)) yield [k, v];
  }

  scheduleFileWrite() {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(Object.fromEntries(this.data)));
        fs.renameSync(`${FILE}.tmp`, FILE);
      } catch (e) {
        this.lastError = e.message;
      }
    }, 500);
  }
}

export const store = new Store();
