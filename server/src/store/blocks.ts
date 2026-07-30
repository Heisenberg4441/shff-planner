/* Доступ к блокам. Только SQL, никакой логики перекрытий. */

import type { Block } from '../../../shared/src/types';
import type { DB } from '../db';

interface BlockRow {
  id: string;
  date: string;
  start_min: number;
  end_min: number;
  title: string;
  category: string;
  note: string;
}

function toBlock(row: BlockRow): Block {
  return {
    id: row.id,
    date: row.date,
    start: row.start_min,
    end: row.end_min,
    title: row.title,
    category: row.category,
    note: row.note,
  };
}

const SELECT = 'SELECT id, date, start_min, end_min, title, category, note FROM blocks';

export function createBlockStore(db: DB) {
  const stmt = {
    range: db.prepare(`${SELECT} WHERE date >= ? AND date <= ? ORDER BY date, start_min`),
    day: db.prepare(`${SELECT} WHERE date = ? ORDER BY start_min`),
    byId: db.prepare(`${SELECT} WHERE id = ?`),
    all: db.prepare(`${SELECT} ORDER BY date, start_min`),
    insert: db.prepare(`
      INSERT INTO blocks (id, date, start_min, end_min, title, category, note, created_at, updated_at)
      VALUES (@id, @date, @start, @end, @title, @category, @note, @ts, @ts)
    `),
    bounds: db.prepare('UPDATE blocks SET start_min = ?, end_min = ?, updated_at = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM blocks WHERE id = ?'),
    clearDay: db.prepare('DELETE FROM blocks WHERE date = ?'),
    clearAll: db.prepare('DELETE FROM blocks'),
    count: db.prepare('SELECT COUNT(*) AS n FROM blocks'),
    countCategory: db.prepare('SELECT COUNT(*) AS n FROM blocks WHERE category = ?'),
  };

  return {
    listRange(from: string, to: string): Block[] {
      return (stmt.range.all(from, to) as BlockRow[]).map(toBlock);
    },
    listDay(date: string): Block[] {
      return (stmt.day.all(date) as BlockRow[]).map(toBlock);
    },
    listDays(dates: string[]): Block[] {
      const out: Block[] = [];
      for (const date of dates) out.push(...(stmt.day.all(date) as BlockRow[]).map(toBlock));
      return out;
    },
    get(id: string): Block | null {
      const row = stmt.byId.get(id) as BlockRow | undefined;
      return row ? toBlock(row) : null;
    },
    listAll(): Block[] {
      return (stmt.all.all() as BlockRow[]).map(toBlock);
    },
    insert(block: Block, ts: string): void {
      stmt.insert.run({ ...block, ts });
    },
    insertMany(blocks: Block[], ts: string): void {
      for (const block of blocks) stmt.insert.run({ ...block, ts });
    },
    setBounds(id: string, start: number, end: number, ts: string): void {
      stmt.bounds.run(start, end, ts, id);
    },
    remove(ids: string[]): void {
      for (const id of ids) stmt.remove.run(id);
    },
    clearDay(date: string): void {
      stmt.clearDay.run(date);
    },
    clearAll(): void {
      stmt.clearAll.run();
    },
    count(): number {
      return (stmt.count.get() as { n: number }).n;
    },
    countByCategory(category: string): number {
      return (stmt.countCategory.get(category) as { n: number }).n;
    },
  };
}

export type BlockStore = ReturnType<typeof createBlockStore>;
