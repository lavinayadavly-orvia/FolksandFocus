import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function openLocalDatabase(filename) {
  if (filename !== ':memory:') await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  return {
    all: async (sql, params = []) => db.prepare(sql).all(...params),
    batch: async commands => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = commands.map(([sql, params = []]) => ({ meta: db.prepare(sql).run(...params) }));
        db.exec('COMMIT'); return results;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close: () => db.close()
  };
}
