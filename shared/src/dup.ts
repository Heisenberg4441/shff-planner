/* ============================================================
   Раскатка разметки: из одних суток в диапазон дней.
   Функция чистая и живёт в shared, потому что клиенту она нужна
   для превью («затронет 21 дн.»), а серверу — чтобы это применить.
   Два разных ответа здесь были бы багом, поэтому код один.
   ============================================================ */

import { addDays, dateKey, daysInMonth, monday, parseDateKey } from './time';
import type { DupScope } from './types';

/** Предохранитель: ни один режим не должен раскатывать больше, чем на год. */
export const MAX_DUP_TARGETS = 400;

export const DUP_SCOPES: DupScope[] = [
  'tomorrow',
  'restweek',
  'workweek',
  'week',
  'month',
  'weekdays',
  'quarter',
];

/** Режимы, которые фильтруются галочками «только эти дни недели». */
export const WEEKDAY_AWARE_SCOPES: DupScope[] = ['month', 'weekdays', 'quarter'];

export function isDupScope(value: unknown): value is DupScope {
  return typeof value === 'string' && (DUP_SCOPES as string[]).includes(value);
}

export function normalizeWeekdays(input: unknown): number[] {
  const raw = Array.isArray(input) ? input : [];
  const set = new Set<number>();
  for (const value of raw) {
    // Number(null) === 0, а это воскресенье: пустое значение не должно
    // превращаться в выбранный день недели
    if (typeof value !== 'number' && typeof value !== 'string') continue;
    if (typeof value === 'string' && !/^\d+$/.test(value.trim())) continue;
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Дни-приёмники для выбранного режима. Источник в список не попадает:
 * копировать сутки в самих себя бессмысленно.
 */
export function duplicationTargets(
  sourceDate: string,
  scope: DupScope,
  weekdays: number[] = [1, 2, 3, 4, 5],
): string[] {
  const d0 = parseDateKey(sourceDate);
  const mon = monday(d0);
  const wd = normalizeWeekdays(weekdays);
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (d: Date) => {
    const k = dateKey(d);
    if (k === sourceDate || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };

  if (scope === 'tomorrow') {
    push(addDays(d0, 1));
  } else if (scope === 'restweek') {
    const last = addDays(mon, 6).getTime();
    for (let i = 1; i <= 7; i++) {
      const d = addDays(d0, i);
      if (d.getTime() <= last) push(d);
    }
  } else if (scope === 'workweek') {
    for (let i = 0; i < 5; i++) push(addDays(mon, i));
  } else if (scope === 'week') {
    for (let i = 0; i < 7; i++) push(addDays(mon, i));
  } else if (scope === 'month') {
    const total = daysInMonth(d0.getFullYear(), d0.getMonth());
    for (let i = 1; i <= total; i++) {
      const d = new Date(d0.getFullYear(), d0.getMonth(), i);
      if (wd.includes(d.getDay())) push(d);
    }
  } else if (scope === 'weekdays') {
    for (let i = 1; i <= 28; i++) {
      const d = addDays(d0, i);
      if (wd.includes(d.getDay())) push(d);
    }
  } else if (scope === 'quarter') {
    for (let i = 1; i <= 90; i++) {
      const d = addDays(d0, i);
      if (wd.includes(d.getDay())) push(d);
    }
  }

  return out.slice(0, MAX_DUP_TARGETS).sort();
}
