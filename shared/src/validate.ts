/* ============================================================
   Валидация входа. Сервер не доверяет никому, включая свой же UI,
   поэтому все проверки собраны здесь и дают человеческий текст:
   он же уезжает в тост на клиенте.
   ============================================================ */

import { isDateKey } from './time';
import {
  DAY_MINUTES,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_BLOCK_MINUTES,
} from './types';
import type { BlockDraft, DupMode, OverlapPolicy, Settings, ThemeId } from './types';

export class ValidationError extends Error {
  readonly field: string | null;

  constructor(message: string, field: string | null = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export const THEMES: ThemeId[] = ['phosphor', 'dock', 'amber', 'plasma', 'ice'];
export const SLOT_CHOICES = [15, 30] as const;
/** Цвет категории: токен темы или явный hex. Иначе в инлайн-стиль лезет что угодно. */
export const COLOR_RE = /^(var\(--[a-z0-9-]{2,32}\)|#[0-9a-fA-F]{3,8})$/;
export const CATEGORY_ID_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;
export const DEFAULT_TITLE = 'Без названия';

function asRecord(input: unknown, what = 'Тело запроса'): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError(what + ' должно быть объектом.');
  }
  return input as Record<string, unknown>;
}

export function requireDateKey(value: unknown, field = 'date'): string {
  if (!isDateKey(value)) {
    throw new ValidationError('Дата должна быть в формате YYYY-MM-DD и существовать в календаре.', field);
  }
  return value;
}

export function requireMinute(value: unknown, field: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > DAY_MINUTES) {
    throw new ValidationError('Время должно быть целым числом минут от 0 до 1440.', field);
  }
  return n;
}

export function normalizeTitle(value: unknown): string {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length > MAX_TITLE_LENGTH) {
    throw new ValidationError(`Название длиннее ${MAX_TITLE_LENGTH} символов.`, 'title');
  }
  return s || DEFAULT_TITLE;
}

export function normalizeNote(value: unknown): string {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length > MAX_NOTE_LENGTH) {
    throw new ValidationError(`Заметка длиннее ${MAX_NOTE_LENGTH} символов.`, 'note');
  }
  return s;
}

export function requireCategory(value: unknown, known: string[]): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id) throw new ValidationError('Категория не указана.', 'category');
  if (!known.includes(id)) {
    throw new ValidationError(`Категории «${id}» нет в базе.`, 'category');
  }
  return id;
}

export function parseBlockDraft(input: unknown, knownCategories: string[]): BlockDraft {
  const body = asRecord(input, 'Блок');
  const start = requireMinute(body.start, 'start');
  const end = requireMinute(body.end, 'end');
  if (end - start < MIN_BLOCK_MINUTES) {
    throw new ValidationError('Конец блока должен быть позже начала.', 'end');
  }
  return {
    start,
    end,
    title: normalizeTitle(body.title),
    category: requireCategory(body.category, knownCategories),
    note: normalizeNote(body.note),
  };
}

export function parseBlockDraftList(input: unknown, knownCategories: string[]): BlockDraft[] {
  if (!Array.isArray(input)) throw new ValidationError('Ожидался список блоков.', 'blocks');
  if (input.length > 300) throw new ValidationError('Больше 300 блоков в сутках — это не план.', 'blocks');
  return input.map((row) => parseBlockDraft(row, knownCategories));
}

export function parseOverlapPolicy(value: unknown): OverlapPolicy {
  if (value === undefined || value === null || value === 'trim') return 'trim';
  if (value === 'reject') return 'reject';
  throw new ValidationError('overlap может быть trim или reject.', 'overlap');
}

export function parseDupMode(value: unknown): DupMode {
  if (value === 'replace' || value === 'merge') return value;
  throw new ValidationError('mode может быть replace или merge.', 'mode');
}

export function parseSettingsPatch(input: unknown): Partial<Settings> {
  const body = asRecord(input, 'Настройки');
  const patch: Partial<Settings> = {};

  if (body.theme !== undefined) {
    if (typeof body.theme !== 'string' || !THEMES.includes(body.theme as ThemeId)) {
      throw new ValidationError('Неизвестная тема.', 'theme');
    }
    patch.theme = body.theme as ThemeId;
  }
  if (body.slotMinutes !== undefined) {
    const n = Number(body.slotMinutes);
    if (!SLOT_CHOICES.includes(n as 15 | 30)) {
      throw new ValidationError('Шаг сетки — 15 или 30 минут.', 'slotMinutes');
    }
    patch.slotMinutes = n as 15 | 30;
  }
  if (body.dayStart !== undefined) {
    const n = Number(body.dayStart);
    if (!Number.isInteger(n) || n < 0 || n > 10) {
      throw new ValidationError('Начало сетки — целый час от 0 до 10.', 'dayStart');
    }
    patch.dayStart = n;
  }
  if (body.showBalance !== undefined) {
    if (typeof body.showBalance !== 'boolean') {
      throw new ValidationError('showBalance — булево.', 'showBalance');
    }
    patch.showBalance = body.showBalance;
  }
  if (body.crt !== undefined) {
    if (typeof body.crt !== 'boolean') throw new ValidationError('crt — булево.', 'crt');
    patch.crt = body.crt;
  }
  if (!Object.keys(patch).length) {
    throw new ValidationError('Нечего менять: в запросе нет известных настроек.');
  }
  return patch;
}

export interface CategoryInput {
  id: string;
  label: string;
  color: string;
}

export function parseCategoryInput(input: unknown, opts: { requireId: boolean }): CategoryInput {
  const body = asRecord(input, 'Категория');
  let id = '';
  if (opts.requireId) {
    id = typeof body.id === 'string' ? body.id.trim().toLowerCase() : '';
    if (!CATEGORY_ID_RE.test(id)) {
      throw new ValidationError('id категории: строчные латинские буквы, цифры, - и _, до 24 знаков.', 'id');
    }
  }
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label || label.length > 40) {
    throw new ValidationError('Название категории — от 1 до 40 символов.', 'label');
  }
  const color = typeof body.color === 'string' ? body.color.trim() : '';
  if (!COLOR_RE.test(color)) {
    throw new ValidationError('Цвет — токен вида var(--accent) или hex вида #33ff99.', 'color');
  }
  return { id, label, color };
}

/* ---------- доступ ---------- */

/** Логин: любые видимые символы без пробелов, 2–32 знака. Кириллица разрешена. */
export const LOGIN_RE = /^\S{2,32}$/;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

/** Управляющие символы в логине — почти всегда чья-то попытка что-то сломать. */
function hasControlChars(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function parseLogin(value: unknown, field = 'login'): string {
  const login = typeof value === 'string' ? value.trim() : '';
  if (!LOGIN_RE.test(login) || hasControlChars(login)) {
    throw new ValidationError('Логин: от 2 до 32 знаков без пробелов.', field);
  }
  return login;
}

export function parsePassword(value: unknown, field = 'password'): string {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `Пароль короче ${MIN_PASSWORD_LENGTH} знаков. Это единственный замок на твоих сутках.`,
      field,
    );
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(`Пароль длиннее ${MAX_PASSWORD_LENGTH} знаков.`, field);
  }
  return value;
}

export type AuthSetupInput =
  | { mode: 'open' }
  | { mode: 'account'; login: string; password: string };

export function parseAuthSetup(input: unknown): AuthSetupInput {
  const body = asRecord(input, 'Настройка доступа');
  if (body.mode === 'open') return { mode: 'open' };
  if (body.mode === 'account') {
    return {
      mode: 'account',
      login: parseLogin(body.login),
      password: parsePassword(body.password),
    };
  }
  throw new ValidationError('mode может быть open или account.', 'mode');
}

export interface TemplateInput {
  name: string;
  note: string;
  rows: BlockDraft[];
}

export function parseTemplateInput(input: unknown, knownCategories: string[]): TemplateInput {
  const body = asRecord(input, 'Шаблон');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 60) {
    throw new ValidationError('Название шаблона — от 1 до 60 символов.', 'name');
  }
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 140) throw new ValidationError('Подпись шаблона длиннее 140 символов.', 'note');
  return { name, note, rows: parseBlockDraftList(body.rows ?? [], knownCategories) };
}
