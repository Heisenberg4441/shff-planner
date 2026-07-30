/* Состояние доступа: одна строка на сервис. Пусто — первый запуск. */

import type { AuthMode } from '../../../shared/src/types';
import type { DB } from '../db';

export interface AuthRecord {
  mode: AuthMode;
  login: string | null;
  passwordHash: string | null;
  /** Растёт при каждой смене доступа и обесценивает выданные cookie. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface AuthRow {
  mode: string;
  login: string | null;
  password_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export function createAuthStore(db: DB) {
  const stmt = {
    read: db.prepare(
      'SELECT mode, login, password_hash, version, created_at, updated_at FROM auth_state WHERE id = 1',
    ),
    write: db.prepare(`
      INSERT INTO auth_state (id, mode, login, password_hash, version, created_at, updated_at)
      VALUES (1, @mode, @login, @passwordHash, 1, @ts, @ts)
      ON CONFLICT(id) DO UPDATE SET
        mode = excluded.mode,
        login = excluded.login,
        password_hash = excluded.password_hash,
        version = auth_state.version + 1,
        updated_at = excluded.updated_at
    `),
  };

  return {
    read(): AuthRecord | null {
      const row = stmt.read.get() as AuthRow | undefined;
      if (!row) return null;
      return {
        mode: row.mode === 'account' ? 'account' : 'open',
        login: row.login,
        passwordHash: row.password_hash,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    write(input: { mode: AuthMode; login: string | null; passwordHash: string | null; ts: string }): AuthRecord {
      stmt.write.run(input);
      return this.read()!;
    },
  };
}

export type AuthStore = ReturnType<typeof createAuthStore>;
