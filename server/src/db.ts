/* ============================================================
   SQLite. Один файл на весь сервис, WAL — чтобы чтение не ждало
   записи, foreign_keys — чтобы блок не мог ссылаться на категорию,
   которой нет.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type DB = Database.Database;

export interface Migration {
  version: number;
  name: string;
  up: (db: DB) => void;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'init',
    up: (db) => {
      db.exec(`
        CREATE TABLE categories (
          id    TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          color TEXT NOT NULL,
          sort  INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE blocks (
          id         TEXT PRIMARY KEY,
          date       TEXT NOT NULL,
          start_min  INTEGER NOT NULL,
          end_min    INTEGER NOT NULL,
          title      TEXT NOT NULL,
          category   TEXT NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
          note       TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (start_min >= 0 AND end_min <= 1440 AND end_min > start_min),
          CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
        );
        CREATE INDEX idx_blocks_date ON blocks(date, start_min);

        CREATE TABLE settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE templates (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          note       TEXT NOT NULL DEFAULT '',
          kind       TEXT NOT NULL DEFAULT 'user',
          sort       INTEGER NOT NULL DEFAULT 0,
          rows_json  TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE ops (
          id         TEXT PRIMARY KEY,
          kind       TEXT NOT NULL,
          summary    TEXT NOT NULL,
          snapshot   TEXT NOT NULL,
          undone     INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_ops_created ON ops(created_at DESC);
      `);
    },
  },
  {
    version: 2,
    name: 'auth-state',
    up: (db) => {
      // Одна строка на весь сервис: планировщик личный, ролей нет.
      // Пустая таблица означает «решение о доступе ещё не принято».
      db.exec(`
        CREATE TABLE auth_state (
          id            INTEGER PRIMARY KEY CHECK (id = 1),
          mode          TEXT NOT NULL CHECK (mode IN ('open', 'account')),
          login         TEXT,
          password_hash TEXT,
          version       INTEGER NOT NULL DEFAULT 1,
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL,
          CHECK (mode = 'open' OR (login IS NOT NULL AND password_hash IS NOT NULL))
        );
      `);
    },
  },
];

export function migrate(db: DB): number {
  const current = db.pragma('user_version', { simple: true }) as number;
  let applied = 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    const run = db.transaction(() => {
      migration.up(db);
      db.pragma('user_version = ' + migration.version);
    });
    run();
    applied++;
  }
  return applied;
}

export function openDatabase(dbPath: string): DB {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

/** Размер базы вместе с WAL — то, что реально занято на диске. */
export function databaseSize(dbPath: string): number {
  if (dbPath === ':memory:') return 0;
  let total = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      total += fs.statSync(dbPath + suffix).size;
    } catch {
      /* файла может не быть */
    }
  }
  return total;
}
