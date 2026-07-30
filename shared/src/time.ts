/* ============================================================
   Время и даты. Никаких библиотек: всё, что нужно планировщику
   суток, — это минуты от полуночи и локальный календарный день.
   ============================================================ */

import { DAY_MINUTES } from './types';

export const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
export const WD_FULL = [
  'воскресенье',
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
];
/** Родительный падеж — для «30 июля». */
export const MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];
/** Именительный — для заголовка «июль 2026». */
export const MONTHS_NOM = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 500 → «08:20», 1440 → «24:00». */
export function fmtTime(min: number): string {
  const m = clampMinute(min);
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
}

/** «08:20» → 500. Мусор превращается в 0 — вызывающий обязан валидировать. */
export function parseTime(value: string | number): number {
  if (typeof value === 'number') return clampMinute(Math.round(value));
  const parts = String(value ?? '').split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return clampMinute((Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0));
}

/**
 * Разбор того, что человек набил руками: «9», «930», «9:3», «24:00», «9.30».
 * null — не разобрали, значит поле оставляем как было.
 */
export function parseTimeLoose(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let h: number;
  let m = 0;
  const sep = s.match(/^(\d{1,2})\s*[:.,\s]\s*(\d{1,2})$/);
  if (sep) {
    h = Number(sep[1]);
    m = Number(sep[2]);
  } else if (/^\d{3,4}$/.test(s)) {
    h = Number(s.slice(0, s.length - 2));
    m = Number(s.slice(-2));
  } else if (/^\d{1,2}$/.test(s)) {
    h = Number(s);
  } else {
    return null;
  }
  if (m > 59) return null;
  if (h > 24 || (h === 24 && m > 0)) return null;
  return h * 60 + m;
}

/** 45 → «45 мин», 150 → «2 ч 30 м», 120 → «2 ч». */
export function humanDur(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return m + ' мин';
  return h + ' ч' + (m ? ' ' + m + ' м' : '');
}

export function clampMinute(min: number): number {
  if (!Number.isFinite(min)) return 0;
  return Math.min(DAY_MINUTES, Math.max(0, Math.round(min)));
}

/* ---------- календарь ---------- */

export function parseDateKey(key: string): Date {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function dateKey(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY_RE.test(value)) return false;
  const d = parseDateKey(value);
  return dateKey(d) === value;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

export function shiftDateKey(key: string, days: number): string {
  return dateKey(addDays(parseDateKey(key), days));
}

/** Неделя начинается с понедельника — как в календаре, а не в API Date. */
export function monday(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

export function todayKey(now: Date = new Date()): string {
  return dateKey(now);
}

export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Номер недели по ISO 8601 — тот, который печатают в календарях. */
export function isoWeek(d: Date): number {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const firstThursday = new Date(t.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export interface DateRange {
  from: string;
  to: string;
}

export function dayRange(key: string): DateRange {
  return { from: key, to: key };
}

export function weekRange(key: string): DateRange {
  const mon = monday(parseDateKey(key));
  return { from: dateKey(mon), to: dateKey(addDays(mon, 6)) };
}

/** Месяц в виде сетки 6×7: от понедельника перед первым числом. */
export function monthGridRange(key: string): DateRange {
  const d = parseDateKey(key);
  const start = monday(new Date(d.getFullYear(), d.getMonth(), 1));
  return { from: dateKey(start), to: dateKey(addDays(start, 41)) };
}

export function rangeForView(view: 'day' | 'week' | 'month', key: string): DateRange {
  if (view === 'week') return weekRange(key);
  if (view === 'month') return monthGridRange(key);
  return dayRange(key);
}

export function eachDate(range: DateRange): string[] {
  const out: string[] = [];
  let cur = parseDateKey(range.from);
  const end = parseDateKey(range.to);
  let guard = 0;
  while (cur.getTime() <= end.getTime() && guard++ < 4000) {
    out.push(dateKey(cur));
    cur = addDays(cur, 1);
  }
  return out;
}
