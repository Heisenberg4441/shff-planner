/* ============================================================
   Перекрытия. В сутках 1440 минут и ни одна не может быть занята
   дважды: планировщик суток — это разбиение, а не список встреч.

   Когда новый блок налезает на существующий, тот «уступает место»:
   подрезается по краю, делится на два, если новый лёг в середину,
   или снимается целиком, если накрыт полностью. Молча удалять
   четырёхчасовое окно из-за пятнадцатиминутной паузы нельзя.
   ============================================================ */

import { MIN_BLOCK_MINUTES } from './types';
import type { Block } from './types';

export interface Interval {
  start: number;
  end: number;
}

/** Кусок существующего блока, уцелевший после подрезки. */
export interface Fragment {
  source: Block;
  start: number;
  end: number;
  /** 0 — оставляем на месте исходный id, дальше — новые блоки от деления. */
  index: number;
}

export interface OverlapPlan {
  /** Блоки, которых новая разметка не касается. */
  untouched: Block[];
  /** Блоки, которые снимаются целиком. */
  removed: Block[];
  /** Уцелевшие куски подрезанных блоков. */
  fragments: Fragment[];
  /** Всё, что было затронуто, — для предупреждения в диалоге. */
  affected: Block[];
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list
    .filter((i) => i.end > i.start)
    .slice()
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ start: cur.start, end: cur.end });
    }
  }
  return out;
}

/** [start,end] минус вырезы. Куски короче минуты не выживают. */
export function subtractIntervals(start: number, end: number, cuts: Interval[]): Interval[] {
  let pieces: Interval[] = [{ start, end }];
  for (const cut of mergeIntervals(cuts)) {
    const next: Interval[] = [];
    for (const p of pieces) {
      if (!overlaps(p, cut)) {
        next.push(p);
        continue;
      }
      if (cut.start > p.start) next.push({ start: p.start, end: Math.min(cut.start, p.end) });
      if (cut.end < p.end) next.push({ start: Math.max(cut.end, p.start), end: p.end });
    }
    pieces = next;
  }
  return pieces.filter((p) => p.end - p.start >= MIN_BLOCK_MINUTES);
}

/**
 * План: что станет с существующей разметкой суток, если положить в них
 * `incoming`. Ничего не мутирует — решение о записи принимает вызывающий.
 */
export function planOverlaps(existing: Block[], incoming: Interval[]): OverlapPlan {
  const cuts = mergeIntervals(incoming);
  const plan: OverlapPlan = { untouched: [], removed: [], fragments: [], affected: [] };

  for (const block of existing) {
    if (!cuts.some((c) => overlaps(block, c))) {
      plan.untouched.push(block);
      continue;
    }
    plan.affected.push(block);
    const pieces = subtractIntervals(block.start, block.end, cuts);
    if (!pieces.length) {
      plan.removed.push(block);
      continue;
    }
    pieces.forEach((p, index) => {
      plan.fragments.push({ source: block, start: p.start, end: p.end, index });
    });
  }

  return plan;
}

/** Блоки, которые мешают поставить интервал. Для предупреждения и для policy=reject. */
export function findConflicts(
  existing: Block[],
  interval: Interval,
  ignoreId?: string | null,
): Block[] {
  return existing.filter((b) => b.id !== ignoreId && overlaps(b, interval));
}

export function sortBlocks<T extends Interval>(blocks: T[]): T[] {
  return blocks.slice().sort((a, b) => a.start - b.start || a.end - b.end);
}
