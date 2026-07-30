/* ============================================================
   Метрики суток. Тот же расчёт нужен и правой панели, и (в будущем)
   отчётам, поэтому считаем здесь, а не в компонентах.
   ============================================================ */

import { sortBlocks } from './overlap';
import type { Interval } from './overlap';
import { DAY_MINUTES } from './types';
import type { Block, Category } from './types';

export const MIN_GAP_MINUTES = 15;

export function plannedMinutes(blocks: Block[]): number {
  return blocks.reduce((acc, b) => acc + (b.end - b.start), 0);
}

export function categoryMinutes(blocks: Block[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of blocks) out[b.category] = (out[b.category] || 0) + (b.end - b.start);
  return out;
}

/**
 * С какой минуты рисуем сетку. Обычно это настройка «начало дня»,
 * но если разметка начинается раньше, сетка расширяется вверх:
 * блок, которого не видно, — это потерянный блок.
 */
export function gridStartMinute(blocks: Block[], dayStartHour: number): number {
  const setting = Math.min(23, Math.max(0, Math.round(dayStartHour))) * 60;
  if (!blocks.length) return setting;
  const earliest = blocks.reduce((min, b) => Math.min(min, b.start), DAY_MINUTES);
  if (earliest >= setting) return setting;
  return Math.max(0, Math.floor(earliest / 60) * 60);
}

/** Незанятые куски суток от начала сетки до 24:00. */
export function dayGaps(
  blocks: Block[],
  gridStart: number,
  minGap: number = MIN_GAP_MINUTES,
): Interval[] {
  const out: Interval[] = [];
  let cursor = gridStart;
  for (const b of sortBlocks(blocks)) {
    if (b.start - cursor >= minGap) out.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (DAY_MINUTES - cursor >= minGap) out.push({ start: cursor, end: DAY_MINUTES });
  return out;
}

export function gapMinutes(gaps: Interval[]): number {
  return gaps.reduce((acc, g) => acc + (g.end - g.start), 0);
}

/**
 * Самое длинное непрерывное окно одной категории. Соседние блоки
 * склеиваются, только если стоят вплотную: пауза рвёт окно.
 */
export function longestRun(blocks: Block[], categoryId: string): number {
  let best = 0;
  let runStart: number | null = null;
  let runEnd = 0;
  for (const b of sortBlocks(blocks)) {
    if (b.category !== categoryId) continue;
    if (runStart !== null && b.start === runEnd) {
      runEnd = b.end;
    } else {
      runStart = b.start;
      runEnd = b.end;
    }
    best = Math.max(best, runEnd - runStart);
  }
  return best;
}

/** Сколько раз за сутки меняется характер занятия. */
export function switchCount(blocks: Block[]): number {
  const sorted = sortBlocks(blocks);
  let n = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].category !== sorted[i].category) n++;
  }
  return n;
}

/** Минуты разметки, оказавшиеся выше начала сетки. */
export function offGridMinutes(blocks: Block[], gridStart: number): number {
  return blocks.reduce(
    (acc, b) => acc + Math.max(0, Math.min(b.end, gridStart) - Math.min(b.start, gridStart)),
    0,
  );
}

/** Категория, по которой считаются «окна»: первая в списке. */
export function focusCategory(categories: Category[]): Category | null {
  const sorted = categories.slice().sort((a, b) => a.sort - b.sort);
  return sorted[0] || null;
}

export interface DaySummary {
  planned: number;
  free: number;
  blocks: number;
  gaps: Interval[];
  gapMinutes: number;
  byCategory: Record<string, number>;
  switches: number;
  focusTotal: number;
  focusWindow: number;
  first: number | null;
  last: number | null;
  offGrid: number;
}

export function summarizeDay(
  blocks: Block[],
  options: { gridStart: number; focusCategoryId?: string | null },
): DaySummary {
  const sorted = sortBlocks(blocks);
  const gaps = dayGaps(sorted, options.gridStart);
  const byCategory = categoryMinutes(sorted);
  const focusId = options.focusCategoryId || null;
  const planned = plannedMinutes(sorted);
  return {
    planned,
    free: Math.max(0, DAY_MINUTES - planned),
    blocks: sorted.length,
    gaps,
    gapMinutes: gapMinutes(gaps),
    byCategory,
    switches: switchCount(sorted),
    focusTotal: focusId ? byCategory[focusId] || 0 : 0,
    focusWindow: focusId ? longestRun(sorted, focusId) : 0,
    first: sorted.length ? sorted[0].start : null,
    last: sorted.length ? sorted[sorted.length - 1].end : null,
    offGrid: offGridMinutes(sorted, options.gridStart),
  };
}
