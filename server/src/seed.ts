/* ============================================================
   Первый запуск. Категории и встроенные шаблоны нужны всегда —
   без них не поставить ни один блок. Демо-неделя только по просьбе
   (SHFF_SEED=demo): чужие данные в личном планировщике — мусор.
   ============================================================ */

import { BUILTIN_TEMPLATES, DEFAULT_CATEGORIES, DEFAULT_SETTINGS, DEMO_DAYS } from '../../shared/src/seed';
import { shiftDateKey, todayKey } from '../../shared/src/time';
import type { DB } from './db';
import { nowIso, uid } from './ids';
import type { BlockStore } from './store/blocks';
import type { MetaStore } from './store/meta';

export interface SeedReport {
  freshDatabase: boolean;
  demoDays: number;
}

export function ensureSeed(deps: {
  db: DB;
  blocks: BlockStore;
  meta: MetaStore;
  seed: 'none' | 'demo';
}): SeedReport {
  const { db, blocks, meta } = deps;
  const ts = nowIso();
  const report: SeedReport = { freshDatabase: false, demoDays: 0 };

  db.transaction(() => {
    if (!meta.categories().length) {
      report.freshDatabase = true;
      for (const cat of DEFAULT_CATEGORIES) meta.addCategory(cat);
      meta.patchSettings(DEFAULT_SETTINGS);
    }

    if (!meta.templates().length) {
      for (const tpl of BUILTIN_TEMPLATES) {
        meta.addTemplate({
          id: tpl.id,
          name: tpl.name,
          note: tpl.note,
          kind: 'builtin',
          sort: tpl.sort,
          rows: tpl.rows,
          ts,
        });
      }
    }

    if (deps.seed === 'demo' && blocks.count() === 0) {
      const today = todayKey();
      for (const day of DEMO_DAYS) {
        const date = shiftDateKey(today, day.offset);
        blocks.insertMany(
          day.rows.map((row) => ({
            id: uid(),
            date,
            start: row.start,
            end: row.end,
            title: row.title,
            category: row.category,
            note: row.note ?? '',
          })),
          ts,
        );
        report.demoDays += 1;
      }
    }
  })();

  return report;
}
