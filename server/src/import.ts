/* Разбор файла бекапа. Импорт — единственный вход, куда пользователь
   льёт большой чужой JSON, поэтому проверяем каждое поле. */

import type { Block, BlockDraft, Category, Settings } from '../../shared/src/types';
import {
  ValidationError,
  parseBlockDraft,
  parseCategoryInput,
  parseSettingsPatch,
  parseTemplateInput,
  requireDateKey,
} from '../../shared/src/validate';

export interface ParsedBundle {
  settings?: Partial<Settings>;
  categories: Category[];
  templates: Array<{ id?: string; name: string; note: string; rows: BlockDraft[]; kind?: string; sort?: number }>;
  blocks: Block[];
  mode: 'replace' | 'merge';
}

const MAX_IMPORT_BLOCKS = 100000;

export function parseImportBundle(input: unknown, knownCategories: string[]): ParsedBundle {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Файл бекапа должен быть JSON-объектом.');
  }
  const body = input as Record<string, unknown>;
  if (body.app !== undefined && body.app !== 'shff-planner') {
    throw new ValidationError('Это бекап другого приложения.');
  }

  const mode = body.mode === 'merge' ? 'merge' : 'replace';

  const rawCategories = Array.isArray(body.categories) ? body.categories : [];
  const categories: Category[] = rawCategories.map((raw, index) => {
    const parsed = parseCategoryInput(raw, { requireId: true });
    const sort = Number((raw as Record<string, unknown>).sort);
    return { ...parsed, sort: Number.isFinite(sort) ? Math.trunc(sort) : index };
  });

  const rawBlocks = Array.isArray(body.blocks) ? body.blocks : [];
  if (rawBlocks.length > MAX_IMPORT_BLOCKS) {
    throw new ValidationError(`В бекапе больше ${MAX_IMPORT_BLOCKS} блоков — это не похоже на план суток.`);
  }

  // блок может ссылаться и на категорию из бекапа, и на уже существующую
  const allowedCategories = [...new Set([...knownCategories, ...categories.map((c) => c.id)])];
  if (rawBlocks.length && !allowedCategories.length) {
    throw new ValidationError('В бекапе есть блоки, но нет ни одной категории.');
  }

  const blocks: Block[] = rawBlocks.map((raw) => {
    const row = raw as Record<string, unknown>;
    const draft = parseBlockDraft(row, allowedCategories);
    return {
      id: typeof row.id === 'string' ? row.id : '',
      date: requireDateKey(row.date),
      start: draft.start,
      end: draft.end,
      title: draft.title,
      category: draft.category,
      note: draft.note ?? '',
    };
  });

  const rawTemplates = Array.isArray(body.templates) ? body.templates : [];
  const templates = rawTemplates.map((raw) => {
    const row = raw as Record<string, unknown>;
    const parsed = parseTemplateInput(row, allowedCategories);
    const sort = Number(row.sort);
    return {
      id: typeof row.id === 'string' ? row.id : undefined,
      kind: row.kind === 'builtin' ? 'builtin' : 'user',
      sort: Number.isFinite(sort) ? Math.trunc(sort) : undefined,
      ...parsed,
    };
  });

  let settings: Partial<Settings> | undefined;
  if (body.settings && typeof body.settings === 'object') {
    const keys = Object.keys(body.settings as Record<string, unknown>);
    if (keys.length) settings = parseSettingsPatch(body.settings);
  }

  return { settings, categories, templates, blocks, mode };
}
