/* Настройки, категории и шаблоны суток. */

import { DEFAULT_SETTINGS } from '../../../shared/src/seed';
import type { BlockDraft, Category, DayTemplate, Settings } from '../../../shared/src/types';
import type { DB } from '../db';

interface TemplateRow {
  id: string;
  name: string;
  note: string;
  kind: string;
  sort: number;
  rows_json: string;
}

export function createMetaStore(db: DB) {
  const stmt = {
    settingsAll: db.prepare('SELECT key, value FROM settings'),
    settingsSet: db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ),
    catsAll: db.prepare('SELECT id, label, color, sort FROM categories ORDER BY sort, id'),
    catGet: db.prepare('SELECT id, label, color, sort FROM categories WHERE id = ?'),
    catInsert: db.prepare(
      'INSERT INTO categories (id, label, color, sort) VALUES (@id, @label, @color, @sort)',
    ),
    catUpdate: db.prepare('UPDATE categories SET label = @label, color = @color WHERE id = @id'),
    catDelete: db.prepare('DELETE FROM categories WHERE id = ?'),
    catMaxSort: db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM categories'),
    tplAll: db.prepare(
      'SELECT id, name, note, kind, sort, rows_json FROM templates ORDER BY sort, created_at',
    ),
    tplGet: db.prepare('SELECT id, name, note, kind, sort, rows_json FROM templates WHERE id = ?'),
    tplInsert: db.prepare(`
      INSERT INTO templates (id, name, note, kind, sort, rows_json, created_at, updated_at)
      VALUES (@id, @name, @note, @kind, @sort, @rows, @ts, @ts)
    `),
    tplUpdate: db.prepare(`
      UPDATE templates SET name = @name, note = @note, rows_json = @rows, updated_at = @ts
       WHERE id = @id
    `),
    tplDelete: db.prepare('DELETE FROM templates WHERE id = ?'),
    tplMaxSort: db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM templates'),
    tplClear: db.prepare('DELETE FROM templates'),
  };

  function toTemplate(row: TemplateRow): DayTemplate {
    let rows: BlockDraft[] = [];
    try {
      const parsed = JSON.parse(row.rows_json);
      if (Array.isArray(parsed)) rows = parsed as BlockDraft[];
    } catch {
      rows = [];
    }
    return {
      id: row.id,
      name: row.name,
      note: row.note,
      kind: row.kind === 'builtin' ? 'builtin' : 'user',
      sort: row.sort,
      rows,
    };
  }

  return {
    /* ---------- настройки ---------- */
    settings(): Settings {
      const rows = stmt.settingsAll.all() as Array<{ key: string; value: string }>;
      const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
      for (const row of rows) {
        try {
          merged[row.key] = JSON.parse(row.value);
        } catch {
          /* битую запись игнорируем — дефолт надёжнее падения */
        }
      }
      return merged as unknown as Settings;
    },
    patchSettings(patch: Partial<Settings>): Settings {
      for (const [key, value] of Object.entries(patch)) {
        stmt.settingsSet.run(key, JSON.stringify(value));
      }
      return this.settings();
    },

    /* ---------- категории ---------- */
    categories(): Category[] {
      return stmt.catsAll.all() as Category[];
    },
    category(id: string): Category | null {
      return (stmt.catGet.get(id) as Category | undefined) ?? null;
    },
    categoryIds(): string[] {
      return this.categories().map((c) => c.id);
    },
    addCategory(input: { id: string; label: string; color: string }): Category {
      const sort = ((stmt.catMaxSort.get() as { m: number }).m ?? -1) + 1;
      stmt.catInsert.run({ ...input, sort });
      return { ...input, sort };
    },
    updateCategory(input: { id: string; label: string; color: string }): void {
      stmt.catUpdate.run(input);
    },
    deleteCategory(id: string): void {
      stmt.catDelete.run(id);
    },

    /* ---------- шаблоны ---------- */
    templates(): DayTemplate[] {
      return (stmt.tplAll.all() as TemplateRow[]).map(toTemplate);
    },
    template(id: string): DayTemplate | null {
      const row = stmt.tplGet.get(id) as TemplateRow | undefined;
      return row ? toTemplate(row) : null;
    },
    addTemplate(input: {
      id: string;
      name: string;
      note: string;
      kind: 'builtin' | 'user';
      rows: BlockDraft[];
      sort?: number;
      ts: string;
    }): DayTemplate {
      const sort = input.sort ?? ((stmt.tplMaxSort.get() as { m: number }).m ?? -1) + 1;
      stmt.tplInsert.run({
        id: input.id,
        name: input.name,
        note: input.note,
        kind: input.kind,
        sort,
        rows: JSON.stringify(input.rows),
        ts: input.ts,
      });
      return { id: input.id, name: input.name, note: input.note, kind: input.kind, sort, rows: input.rows };
    },
    updateTemplate(input: { id: string; name: string; note: string; rows: BlockDraft[]; ts: string }): void {
      stmt.tplUpdate.run({
        id: input.id,
        name: input.name,
        note: input.note,
        rows: JSON.stringify(input.rows),
        ts: input.ts,
      });
    },
    deleteTemplate(id: string): void {
      stmt.tplDelete.run(id);
    },
    clearTemplates(): void {
      stmt.tplClear.run();
    },
  };
}

export type MetaStore = ReturnType<typeof createMetaStore>;
