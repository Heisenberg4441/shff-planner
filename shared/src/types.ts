/* ============================================================
   Домен планировщика. Один файл типов на сервер и клиент.

   Время внутри суток — всегда целые минуты от полуночи: 0..1440.
   1440 — это «24:00», правая граница суток, а не начало следующих.
   Дата — всегда локальная строка YYYY-MM-DD без зоны: планировщик
   про сутки человека, а не про мгновение на глобусе.
   ============================================================ */

export type ViewMode = 'day' | 'week' | 'month';

export interface Block {
  id: string;
  date: string;
  start: number;
  end: number;
  title: string;
  category: string;
  note: string;
}

/** Всё, что нужно, чтобы поставить блок: без id и без даты. */
export interface BlockDraft {
  start: number;
  end: number;
  title: string;
  category: string;
  note?: string;
}

export interface Category {
  id: string;
  label: string;
  color: string;
  sort: number;
}

export interface DayTemplate {
  id: string;
  name: string;
  note: string;
  kind: 'builtin' | 'user';
  sort: number;
  rows: BlockDraft[];
}

export type ThemeId = 'phosphor' | 'dock' | 'amber' | 'plasma' | 'ice';

export interface Settings {
  theme: ThemeId;
  /** Шаг сетки в минутах: одна кликабельная ячейка. */
  slotMinutes: 15 | 30;
  /** Час, с которого начинается видимая сетка (0..10). */
  dayStart: number;
  showBalance: boolean;
  crt: boolean;
}

/** Куда раскатывать разметку. Совпадает с набором кнопок в диалоге. */
export type DupScope =
  | 'tomorrow'
  | 'restweek'
  | 'workweek'
  | 'week'
  | 'month'
  | 'weekdays'
  | 'quarter';

/** replace — сутки в приёмнике очищаются целиком, merge — копии кладутся поверх. */
export type DupMode = 'replace' | 'merge';

/**
 * Что делать, когда новый блок налезает на существующий:
 *   trim   — существующие уступают место (подрезаются, при полном
 *            накрытии снимаются, при накрытии середины — делятся);
 *   reject — не сохранять, вернуть конфликт.
 */
export type OverlapPolicy = 'trim' | 'reject';

export interface DuplicateRequest {
  sourceDate: string;
  /** null — копируются все блоки суток. */
  blockIds: string[] | null;
  scope: DupScope;
  /** Дни недели 0..6, вс=0. Учитываются для month/weekdays/quarter. */
  weekdays: number[];
  mode: DupMode;
}

/** Ответ на любую мутацию: что изменилось и чем это откатить. */
export interface MutationResult {
  days: string[];
  blocks: Block[];
  op: OpRef | null;
  revision: number;
  /** true — блоки в ответ не влезли, клиент перечитывает видимый диапазон сам. */
  partial: boolean;
}

export interface OpRef {
  id: string;
  kind: string;
  summary: string;
  createdAt: string;
}

/**
 * Как охраняется планировщик.
 *   open    — вход свободный, доверенная сеть;
 *   account — логин и пароль администратора.
 */
export type AuthMode = 'open' | 'account';

export interface AuthInfo {
  /** false — первый запуск: решение о доступе ещё не принято. */
  configured: boolean;
  mode: AuthMode;
  login: string | null;
  /** env — пароль задан переменной окружения; из панели его не поменять. */
  source: 'env' | 'db' | 'none';
  authenticated: boolean;
}

export interface ExportBundle {
  app: 'shff-planner';
  version: number;
  exportedAt: string;
  settings: Settings;
  categories: Category[];
  templates: DayTemplate[];
  blocks: Block[];
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSec: number;
  time: string;
  db: { path: string; blocks: number; sizeBytes: number };
  auth: AuthMode | 'unconfigured';
}

export const DAY_MINUTES = 1440;
export const MIN_BLOCK_MINUTES = 1;
export const MAX_TITLE_LENGTH = 200;
export const MAX_NOTE_LENGTH = 500;
