// SQLite (node:sqlite, no dependencies): users, per-user reading state, and chat usage.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dir, 'paradise.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '',
      first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, logins INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS usage (
      user_id INTEGER NOT NULL, day TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_micro INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day)
    );`);
  const q = {
    upsert: db.prepare(`INSERT INTO users (email, name, first_seen, last_seen, logins) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(email) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen, logins = logins + 1 RETURNING id, email, name`),
    touch: db.prepare('UPDATE users SET last_seen = ? WHERE id = ?'),
    byId: db.prepare('SELECT id, email, name FROM users WHERE id = ?'),
    byEmail: db.prepare('SELECT id, email, name FROM users WHERE email = ?'),
    getState: db.prepare('SELECT state FROM users WHERE id = ?'),
    setState: db.prepare('UPDATE users SET state = ? WHERE id = ?'),
    delUser: db.prepare('DELETE FROM users WHERE id = ?'),
    delUsage: db.prepare('DELETE FROM usage WHERE user_id = ?'),
    addUsage: db.prepare(`INSERT INTO usage (user_id, day, requests, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens, cost_micro)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET requests = requests + 1,
      input_tokens = input_tokens + excluded.input_tokens, cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
      cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens, output_tokens = output_tokens + excluded.output_tokens,
      cost_micro = cost_micro + excluded.cost_micro`),
    userDay: db.prepare('SELECT COALESCE(SUM(cost_micro), 0) AS c FROM usage WHERE user_id = ? AND day = ?'),
    dayAll: db.prepare('SELECT COALESCE(SUM(cost_micro), 0) AS c FROM usage WHERE day = ?'),
    month: db.prepare('SELECT COALESCE(SUM(cost_micro), 0) AS c FROM usage WHERE day >= ?'),
    byDay: db.prepare(`SELECT day, COUNT(DISTINCT user_id) AS users, SUM(requests) AS requests, SUM(cost_micro) AS cost_micro
      FROM usage WHERE day >= ? GROUP BY day ORDER BY day DESC`),
    top: db.prepare(`SELECT u.email, SUM(x.requests) AS requests, SUM(x.cost_micro) AS cost_micro FROM usage x JOIN users u ON u.id = x.user_id
      WHERE x.day >= ? GROUP BY u.id ORDER BY cost_micro DESC LIMIT 20`),
    readers: db.prepare(`SELECT u.id, u.email, u.name, u.first_seen, u.last_seen, u.logins, u.state,
      COALESCE((SELECT SUM(requests) FROM usage WHERE user_id = u.id), 0) AS asks FROM users u ORDER BY u.last_seen DESC`),
    profile: db.prepare('SELECT u.first_seen, u.logins, COALESCE((SELECT SUM(requests) FROM usage WHERE user_id = u.id), 0) AS asks FROM users u WHERE u.id = ?'),
    counts: db.prepare(`SELECT COUNT(*) AS users, COALESCE(SUM(last_seen >= ?), 0) AS active_7d FROM users`),
  };
  return {
    raw: db, // keep the connection referenced: statements alone don't stop it being collected
    login: (email, name) => q.upsert.get(email, name || '', Date.now(), Date.now()),
    touch: (id) => q.touch.run(Date.now(), id),
    user: (id) => q.byId.get(id) || null,
    userByEmail: (email) => q.byEmail.get(email) || null,
    getState: (id) => { try { return JSON.parse(q.getState.get(id)?.state || '{}'); } catch { return {}; } },
    setState: (id, s) => q.setState.run(JSON.stringify(s), id),
    deleteUser: (id) => { q.delUsage.run(id); q.delUser.run(id); },
    addUsage: (id, day, u, costMicro) => q.addUsage.run(id, day, u.input, u.cacheWrite, u.cacheRead, u.output, costMicro),
    spentToday: (id, day) => q.userDay.get(id, day).c,
    spentDay: (day) => q.dayAll.get(day).c,
    spentSince: (day) => q.month.get(day).c,
    profile: (id) => q.profile.get(id),
    readers: () => q.readers.all(),
    report: (since) => ({ days: q.byDay.all(since), top: q.top.all(since), ...q.counts.get(Date.now() - 7 * 864e5) }),
  };
}
