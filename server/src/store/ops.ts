/* ============================================================
   Журнал операций для отмены. Перед каждой мутацией пишем снимок
   затронутых суток; «отменить» — это записать снимок назад.
   Дёшево, потому что снимок — это несколько десятков блоков,
   и надёжно, потому что не зависит от вида операции.
   ============================================================ */

import type { Block, Category, DayTemplate, Settings } from '../../../shared/src/types';
import type { DB } from '../db';

export interface Snapshot {
  days?: Record<string, Block[]>;
  settings?: Settings;
  categories?: Category[];
  templates?: DayTemplate[];
}

export interface OpRecord {
  id: string;
  kind: string;
  summary: string;
  snapshot: Snapshot;
  undone: boolean;
  createdAt: string;
}

/** Сколько операций держим в журнале: глубина «отменить». */
export const OPS_KEPT = 50;

interface OpRow {
  id: string;
  kind: string;
  summary: string;
  snapshot: string;
  undone: number;
  created_at: string;
}

export function createOpStore(db: DB) {
  const stmt = {
    insert: db.prepare(`
      INSERT INTO ops (id, kind, summary, snapshot, undone, created_at)
      VALUES (@id, @kind, @summary, @snapshot, 0, @createdAt)
    `),
    get: db.prepare('SELECT * FROM ops WHERE id = ?'),
    latest: db.prepare('SELECT * FROM ops WHERE undone = 0 ORDER BY created_at DESC, rowid DESC LIMIT 1'),
    markUndone: db.prepare('UPDATE ops SET undone = 1 WHERE id = ?'),
    prune: db.prepare(`
      DELETE FROM ops WHERE id IN (
        SELECT id FROM ops ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?
      )
    `),
  };

  function toOp(row: OpRow | undefined): OpRecord | null {
    if (!row) return null;
    let snapshot: Snapshot = {};
    try {
      snapshot = JSON.parse(row.snapshot) as Snapshot;
    } catch {
      snapshot = {};
    }
    return {
      id: row.id,
      kind: row.kind,
      summary: row.summary,
      snapshot,
      undone: row.undone === 1,
      createdAt: row.created_at,
    };
  }

  return {
    push(op: { id: string; kind: string; summary: string; snapshot: Snapshot; createdAt: string }): void {
      stmt.insert.run({ ...op, snapshot: JSON.stringify(op.snapshot) });
      stmt.prune.run(OPS_KEPT);
    },
    get(id: string): OpRecord | null {
      return toOp(stmt.get.get(id) as OpRow | undefined);
    },
    latest(): OpRecord | null {
      return toOp(stmt.latest.get() as OpRow | undefined);
    },
    markUndone(id: string): void {
      stmt.markUndone.run(id);
    },
  };
}

export type OpStore = ReturnType<typeof createOpStore>;
