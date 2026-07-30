/* ============================================================
   Сценарии работы с разметкой. Всё, что меняет базу, проходит здесь:
   одна транзакция, один снимок для отмены, одно событие клиентам.
   Правила перекрытий берутся из shared — они же работают в UI.
   ============================================================ */

import { duplicationTargets } from '../../shared/src/dup';
import { findConflicts, planOverlaps, sortBlocks } from '../../shared/src/overlap';
import { pluralBlocks, pluralDays } from '../../shared/src/plural';
import { fmtTime } from '../../shared/src/time';
import type {
  Block,
  BlockDraft,
  Category,
  DayTemplate,
  DuplicateRequest,
  ExportBundle,
  OpRef,
  OverlapPolicy,
  Settings,
} from '../../shared/src/types';
import type { DB } from './db';
import { badRequest, conflict, notFound } from './errors';
import type { Events } from './events';
import { nowIso, uid } from './ids';
import type { BlockStore } from './store/blocks';
import type { MetaStore } from './store/meta';
import type { OpStore, Snapshot } from './store/ops';

export interface MutationOutcome {
  days: string[];
  blocks: Block[];
  op: OpRef | null;
  revision: number;
  /** true — блоки в ответ не влезли, клиент перечитывает видимый диапазон сам. */
  partial: boolean;
}

export interface ServiceDeps {
  db: DB;
  blocks: BlockStore;
  meta: MetaStore;
  ops: OpStore;
  events: Events;
  logger?: { warn: (msg: string) => void };
}

/** Больше этого числа блоков — снимок для отмены не пишем: смысла нет, а память есть. */
const SNAPSHOT_BLOCK_LIMIT = 20000;

/** Дольше этого диапазона ответ мутации не таскает блоки: клиент перечитает видимое. */
const PAYLOAD_DAY_LIMIT = 120;

export function createService(deps: ServiceDeps) {
  const { db, blocks, meta, ops, events } = deps;

  function uniqueDays(days: Array<string | undefined | null>): string[] {
    return [...new Set(days.filter((d): d is string => !!d))].sort();
  }

  function snapshotDays(days: string[]): Snapshot {
    const out: Record<string, Block[]> = {};
    for (const day of days) out[day] = blocks.listDay(day);
    return { days: out };
  }

  function recordOp(kind: string, summary: string, snapshot: Snapshot): OpRef {
    const ref: OpRef = { id: uid('op'), kind, summary, createdAt: nowIso() };
    ops.push({ ...ref, snapshot });
    return ref;
  }

  function finish(
    kind: string,
    days: string[],
    op: OpRef | null,
    origin: string | null | undefined,
  ): MutationOutcome {
    const revision = events.publish({ kind, days, opId: op?.id ?? null, origin: origin ?? null });
    const partial = days.length > PAYLOAD_DAY_LIMIT;
    return { days, blocks: partial ? [] : blocks.listDays(days), op, revision, partial };
  }

  /** Применяет план перекрытий: снимает накрытые блоки и подрезает задетые. */
  function applyOverlapPlan(date: string, incoming: Array<{ start: number; end: number }>, ts: string) {
    const existing = blocks.listDay(date);
    const plan = planOverlaps(existing, incoming);
    blocks.remove(plan.removed.map((b) => b.id));
    for (const fragment of plan.fragments) {
      if (fragment.index === 0) {
        blocks.setBounds(fragment.source.id, fragment.start, fragment.end, ts);
      } else {
        blocks.insert(
          {
            ...fragment.source,
            id: uid(),
            start: fragment.start,
            end: fragment.end,
          },
          ts,
        );
      }
    }
    return plan;
  }

  /** Категория могла исчезнуть между снимком и отменой — не даём упасть на FK. */
  function safeCategory(id: string, known: Set<string>, fallback: string): string {
    if (known.has(id)) return id;
    deps.logger?.warn(`Категория «${id}» исчезла, блок восстановлен в «${fallback}»`);
    return fallback;
  }

  function restoreSnapshot(snapshot: Snapshot): string[] {
    const touched: string[] = [];

    if (snapshot.categories) {
      const current = new Map(meta.categories().map((c) => [c.id, c]));
      for (const cat of snapshot.categories) {
        if (current.has(cat.id)) meta.updateCategory(cat);
        else meta.addCategory(cat);
      }
    }

    if (snapshot.days) {
      const known = new Set(meta.categoryIds());
      const fallback = meta.categories()[0]?.id;
      const ts = nowIso();
      for (const [date, list] of Object.entries(snapshot.days)) {
        blocks.clearDay(date);
        if (!fallback) continue;
        blocks.insertMany(
          list.map((b) => ({ ...b, date, category: safeCategory(b.category, known, fallback) })),
          ts,
        );
        touched.push(date);
      }
    }

    if (snapshot.settings) meta.patchSettings(snapshot.settings);

    if (snapshot.templates) {
      meta.clearTemplates();
      const ts = nowIso();
      for (const tpl of snapshot.templates) {
        meta.addTemplate({ ...tpl, ts, sort: tpl.sort });
      }
    }

    return uniqueDays(touched);
  }

  return {
    /* ---------- чтение ---------- */
    listRange(from: string, to: string): Block[] {
      return blocks.listRange(from, to);
    },

    /* ---------- один блок ---------- */
    saveBlock(input: {
      id?: string | null;
      date: string;
      draft: BlockDraft;
      overlap: OverlapPolicy;
      origin?: string | null;
    }): MutationOutcome {
      const previous = input.id ? blocks.get(input.id) : null;
      if (input.id && !previous) throw notFound('Блок не найден: возможно, его уже сняли.');

      const days = uniqueDays([input.date, previous?.date]);
      const interval = { start: input.draft.start, end: input.draft.end };
      const rivals = findConflicts(blocks.listDay(input.date), interval, previous?.id ?? null);
      if (input.overlap === 'reject' && rivals.length) {
        throw conflict('Блок пересекается с тем, что уже стоит в этих сутках.', rivals);
      }

      const snapshot = snapshotDays(days);
      const ts = nowIso();

      db.transaction(() => {
        // блок не должен спорить сам с собой: снимаем и ставим заново тем же id,
        // это же переносит его между сутками, если дату поменяли
        if (previous) blocks.remove([previous.id]);
        applyOverlapPlan(input.date, [interval], ts);
        blocks.insert(
          {
            id: previous?.id ?? uid(),
            date: input.date,
            start: input.draft.start,
            end: input.draft.end,
            title: input.draft.title,
            category: input.draft.category,
            note: input.draft.note ?? '',
          },
          ts,
        );
      })();

      const summary = `${input.draft.title} · ${fmtTime(input.draft.start)}–${fmtTime(input.draft.end)} · ${input.date}`;
      const op = recordOp(previous ? 'block.update' : 'block.create', summary, snapshot);
      return finish('blocks', days, op, input.origin);
    },

    deleteBlock(id: string, origin?: string | null): MutationOutcome & { removed: Block } {
      const block = blocks.get(id);
      if (!block) throw notFound('Блок не найден: возможно, его уже сняли.');
      const snapshot = snapshotDays([block.date]);
      db.transaction(() => blocks.remove([id]))();
      const op = recordOp('block.delete', `${block.title} · ${block.date}`, snapshot);
      return { ...finish('blocks', [block.date], op, origin), removed: block };
    },

    /* ---------- сутки целиком ---------- */
    replaceDay(input: {
      date: string;
      drafts: BlockDraft[];
      summary?: string;
      origin?: string | null;
    }): MutationOutcome {
      const sorted = sortBlocks(input.drafts);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].start < sorted[i - 1].end) {
          throw badRequest('Блоки в запросе пересекаются между собой — сутки не разбиение.');
        }
      }
      const snapshot = snapshotDays([input.date]);
      const ts = nowIso();
      db.transaction(() => {
        blocks.clearDay(input.date);
        blocks.insertMany(
          sorted.map((draft) => ({
            id: uid(),
            date: input.date,
            start: draft.start,
            end: draft.end,
            title: draft.title,
            category: draft.category,
            note: draft.note ?? '',
          })),
          ts,
        );
      })();
      const summary = input.summary ?? `сутки ${input.date} → ${pluralBlocks(sorted.length)}`;
      const op = recordOp('day.replace', summary, snapshot);
      return finish('blocks', [input.date], op, input.origin);
    },

    /* ---------- раскатка ---------- */
    duplicate(request: DuplicateRequest, origin?: string | null): MutationOutcome & { targets: string[] } {
      const source = blocks.listDay(request.sourceDate);
      const items = request.blockIds
        ? source.filter((b) => request.blockIds!.includes(b.id))
        : source;
      if (!items.length) throw badRequest('В источнике нет блоков.');

      const targets = duplicationTargets(request.sourceDate, request.scope, request.weekdays);
      if (!targets.length) throw badRequest('В выбранном диапазоне нет дней.');

      const snapshot = snapshotDays(targets);
      const ts = nowIso();
      const wholeDay = !request.blockIds;

      db.transaction(() => {
        for (const target of targets) {
          const copies: Block[] = items.map((b) => ({ ...b, id: uid(), date: target }));
          if (request.mode === 'replace' && wholeDay) {
            blocks.clearDay(target);
          } else {
            applyOverlapPlan(target, copies, ts);
          }
          blocks.insertMany(copies, ts);
        }
      })();

      const what = wholeDay ? `сутки ${request.sourceDate}` : `блок из ${request.sourceDate}`;
      const op = recordOp('day.duplicate', `${what} → ${pluralDays(targets.length)}`, snapshot);
      return { ...finish('blocks', targets, op, origin), targets };
    },

    /* ---------- отмена ---------- */
    undo(opId: string | null, origin?: string | null): MutationOutcome & { undone: OpRef } {
      const op = opId ? ops.get(opId) : ops.latest();
      if (!op) throw notFound('Отменять нечего: журнал пуст.');
      if (op.undone) throw badRequest('Эта операция уже отменена.');

      let days: string[] = [];
      db.transaction(() => {
        days = restoreSnapshot(op.snapshot);
        ops.markUndone(op.id);
      })();

      const ref: OpRef = { id: op.id, kind: op.kind, summary: op.summary, createdAt: op.createdAt };
      return {
        ...finish('undo', days, null, origin),
        undone: ref,
      };
    },

    lastOp(): OpRef | null {
      const op = ops.latest();
      return op ? { id: op.id, kind: op.kind, summary: op.summary, createdAt: op.createdAt } : null;
    },

    /* ---------- настройки, категории, шаблоны ---------- */
    patchSettings(patch: Partial<Settings>, origin?: string | null): Settings {
      const next = db.transaction(() => meta.patchSettings(patch))();
      events.publish({ kind: 'settings', origin: origin ?? null });
      return next;
    },

    addCategory(input: { id: string; label: string; color: string }, origin?: string | null): Category {
      if (meta.category(input.id)) throw badRequest(`Категория «${input.id}» уже есть.`);
      const created = db.transaction(() => meta.addCategory(input))();
      events.publish({ kind: 'categories', origin: origin ?? null });
      return created;
    },

    updateCategory(input: { id: string; label: string; color: string }, origin?: string | null): Category {
      if (!meta.category(input.id)) throw notFound('Категория не найдена.');
      db.transaction(() => meta.updateCategory(input))();
      events.publish({ kind: 'categories', origin: origin ?? null });
      return meta.category(input.id)!;
    },

    deleteCategory(id: string, origin?: string | null): void {
      const existing = meta.category(id);
      if (!existing) throw notFound('Категория не найдена.');
      if (meta.categories().length <= 1) throw badRequest('Последнюю категорию удалить нельзя.');
      const used = blocks.countByCategory(id);
      if (used > 0) {
        throw badRequest(`Категория занята: на ней стоит ${pluralBlocks(used)}. Сначала переназначь их.`);
      }
      db.transaction(() => meta.deleteCategory(id))();
      events.publish({ kind: 'categories', origin: origin ?? null });
    },

    addTemplate(
      input: { name: string; note: string; rows: BlockDraft[] },
      origin?: string | null,
    ): DayTemplate {
      const created = db.transaction(() =>
        meta.addTemplate({ id: uid('t'), kind: 'user', ts: nowIso(), ...input }),
      )();
      events.publish({ kind: 'templates', origin: origin ?? null });
      return created;
    },

    updateTemplate(
      input: { id: string; name: string; note: string; rows: BlockDraft[] },
      origin?: string | null,
    ): DayTemplate {
      const existing = meta.template(input.id);
      if (!existing) throw notFound('Шаблон не найден.');
      if (existing.kind === 'builtin') throw badRequest('Встроенный шаблон править нельзя — сделай свой.');
      db.transaction(() => meta.updateTemplate({ ...input, ts: nowIso() }))();
      events.publish({ kind: 'templates', origin: origin ?? null });
      return meta.template(input.id)!;
    },

    deleteTemplate(id: string, origin?: string | null): OpRef {
      const existing = meta.template(id);
      if (!existing) throw notFound('Шаблон не найден.');
      if (existing.kind === 'builtin') throw badRequest('Встроенный шаблон удалить нельзя.');
      const snapshot: Snapshot = { templates: meta.templates() };
      db.transaction(() => meta.deleteTemplate(id))();
      const op = recordOp('template.delete', `шаблон «${existing.name}»`, snapshot);
      events.publish({ kind: 'templates', opId: op.id, origin: origin ?? null });
      return op;
    },

    /* ---------- бекап ---------- */
    exportAll(): ExportBundle {
      return {
        app: 'shff-planner',
        version: 1,
        exportedAt: nowIso(),
        settings: meta.settings(),
        categories: meta.categories(),
        templates: meta.templates(),
        blocks: blocks.listAll(),
      };
    },

    importBundle(
      bundle: {
        settings?: Partial<Settings>;
        categories: Category[];
        templates: Array<{ name: string; note: string; rows: BlockDraft[]; kind?: string; id?: string; sort?: number }>;
        blocks: Block[];
      },
      mode: 'replace' | 'merge',
      origin?: string | null,
    ): MutationOutcome {
      const total = blocks.count();
      const bundleDays = uniqueDays(bundle.blocks.map((b) => b.date));
      const snapshot: Snapshot =
        total > SNAPSHOT_BLOCK_LIMIT
          ? {}
          : {
              days: Object.fromEntries(
                uniqueDays([...bundleDays, ...blocks.listAll().map((b) => b.date)]).map((d) => [
                  d,
                  blocks.listDay(d),
                ]),
              ),
              settings: meta.settings(),
              categories: meta.categories(),
              templates: meta.templates(),
            };

      const ts = nowIso();
      db.transaction(() => {
        if (mode === 'replace') {
          blocks.clearAll();
          meta.clearTemplates();
          const keep = new Set(bundle.categories.map((c) => c.id));
          for (const cat of meta.categories()) {
            if (!keep.has(cat.id)) meta.deleteCategory(cat.id);
          }
        }

        for (const cat of bundle.categories) {
          if (meta.category(cat.id)) meta.updateCategory(cat);
          else meta.addCategory(cat);
        }

        if (mode === 'replace' && bundle.settings) meta.patchSettings(bundle.settings);

        for (const tpl of bundle.templates) {
          const kind = tpl.kind === 'builtin' ? 'builtin' : 'user';
          const id = mode === 'replace' && tpl.id ? tpl.id : uid('t');
          if (meta.template(id)) {
            meta.updateTemplate({ id, name: tpl.name, note: tpl.note, rows: tpl.rows, ts });
          } else {
            meta.addTemplate({ id, name: tpl.name, note: tpl.note, kind, rows: tpl.rows, sort: tpl.sort, ts });
          }
        }

        const known = new Set(meta.categoryIds());
        const fallback = meta.categories()[0]?.id ?? '';
        if (mode === 'merge') {
          for (const day of bundleDays) blocks.clearDay(day);
        }
        blocks.insertMany(
          bundle.blocks.map((b) => ({
            ...b,
            id: uid(),
            category: safeCategory(b.category, known, fallback),
          })),
          ts,
        );
      })();

      const op = recordOp('import', `импорт ${pluralBlocks(bundle.blocks.length)}`, snapshot);
      const affected = mode === 'replace' ? uniqueDays(Object.keys(snapshot.days ?? {})) : bundleDays;
      return finish('import', affected.length ? affected : bundleDays, op, origin);
    },

    stats() {
      return { blocks: blocks.count() };
    },
  };
}

export type Service = ReturnType<typeof createService>;
