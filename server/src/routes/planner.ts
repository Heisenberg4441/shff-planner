/* Разметка суток: чтение диапазона, блоки, сутки целиком, раскатка, отмена. */

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { isDupScope, normalizeWeekdays } from '../../../shared/src/dup';
import { rangeForView } from '../../../shared/src/time';
import type { DuplicateRequest } from '../../../shared/src/types';
import {
  ValidationError,
  parseBlockDraft,
  parseBlockDraftList,
  parseDupMode,
  parseOverlapPolicy,
  requireDateKey,
} from '../../../shared/src/validate';
import { SESSION_COOKIE, readCookie } from '../auth';
import { badRequest, notFound } from '../errors';
import type { RouteContext } from './context';
import { origin, query } from './context';

function readRange(request: FastifyRequest): { from: string; to: string } {
  const q = query(request);
  if (q.view && q.date) {
    const view = q.view === 'week' || q.view === 'month' ? q.view : 'day';
    return rangeForView(view, requireDateKey(q.date, 'date'));
  }
  const from = requireDateKey(q.from, 'from');
  const to = requireDateKey(q.to, 'to');
  if (to < from) throw badRequest('Конец диапазона раньше начала.');
  return { from, to };
}

export function registerPlannerRoutes(app: FastifyInstance, ctx: RouteContext): void {
  /** Всё, что нужно интерфейсу при загрузке, одним запросом. */
  app.get('/api/bootstrap', (request) => {
    const range = readRange(request);
    return {
      server: {
        version: ctx.cfg.version,
        time: new Date().toISOString(),
        revision: ctx.events.revision,
        auth: ctx.auth.info(readCookie(request.headers.cookie, SESSION_COOKIE)),
        seed: ctx.cfg.seed,
      },
      range,
      settings: ctx.meta.settings(),
      categories: ctx.meta.categories(),
      templates: ctx.meta.templates(),
      blocks: ctx.service.listRange(range.from, range.to),
      lastOp: ctx.service.lastOp(),
    };
  });

  app.get('/api/blocks', (request) => {
    const range = readRange(request);
    return { range, blocks: ctx.service.listRange(range.from, range.to) };
  });

  app.get('/api/blocks/:id', (request) => {
    const { id } = request.params as { id: string };
    const block = ctx.blocks.get(id);
    if (!block) throw notFound('Блок не найден.');
    return { block };
  });

  app.post('/api/blocks', (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const date = requireDateKey(body.date);
    const draft = parseBlockDraft(body, ctx.meta.categoryIds());
    const result = ctx.service.saveBlock({
      date,
      draft,
      overlap: parseOverlapPolicy(body.overlap),
      origin: origin(request),
    });
    reply.code(201);
    return result;
  });

  app.patch('/api/blocks/:id', (request) => {
    const { id } = request.params as { id: string };
    const existing = ctx.blocks.get(id);
    if (!existing) throw notFound('Блок не найден: возможно, его уже сняли.');
    const body = (request.body ?? {}) as Record<string, unknown>;
    // PATCH достраивает недостающие поля из текущего блока
    const merged = {
      start: body.start ?? existing.start,
      end: body.end ?? existing.end,
      title: body.title ?? existing.title,
      category: body.category ?? existing.category,
      note: body.note ?? existing.note,
    };
    const draft = parseBlockDraft(merged, ctx.meta.categoryIds());
    const date = body.date === undefined ? existing.date : requireDateKey(body.date);
    return ctx.service.saveBlock({
      id,
      date,
      draft,
      overlap: parseOverlapPolicy(body.overlap),
      origin: origin(request),
    });
  });

  app.delete('/api/blocks/:id', (request) => {
    const { id } = request.params as { id: string };
    return ctx.service.deleteBlock(id, origin(request));
  });

  /** Заменить сутки целиком: применение шаблона и «очистить сутки». */
  app.put('/api/days/:date', (request) => {
    const date = requireDateKey((request.params as { date: string }).date);
    const body = (request.body ?? {}) as Record<string, unknown>;

    if (typeof body.templateId === 'string') {
      const template = ctx.meta.template(body.templateId);
      if (!template) throw notFound('Шаблон не найден.');
      return ctx.service.replaceDay({
        date,
        drafts: template.rows,
        summary: `шаблон «${template.name}» → ${date}`,
        origin: origin(request),
      });
    }

    const drafts = parseBlockDraftList(body.blocks ?? [], ctx.meta.categoryIds());
    return ctx.service.replaceDay({ date, drafts, origin: origin(request) });
  });

  app.get('/api/days/:date', (request) => {
    const date = requireDateKey((request.params as { date: string }).date);
    return { date, blocks: ctx.blocks.listDay(date) };
  });

  app.post('/api/duplicate', (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (!isDupScope(body.scope)) {
      throw new ValidationError('Неизвестный режим раскатки.', 'scope');
    }
    let blockIds: string[] | null = null;
    if (body.blockIds !== undefined && body.blockIds !== null) {
      if (!Array.isArray(body.blockIds) || body.blockIds.some((v) => typeof v !== 'string')) {
        throw new ValidationError('blockIds — список идентификаторов блоков.', 'blockIds');
      }
      blockIds = body.blockIds as string[];
      if (!blockIds.length) throw new ValidationError('Список блоков пуст.', 'blockIds');
    }
    const payload: DuplicateRequest = {
      sourceDate: requireDateKey(body.sourceDate, 'sourceDate'),
      blockIds,
      scope: body.scope,
      weekdays: normalizeWeekdays(body.weekdays ?? [1, 2, 3, 4, 5]),
      mode: parseDupMode(body.mode ?? 'merge'),
    };
    return ctx.service.duplicate(payload, origin(request));
  });

  app.post('/api/undo', (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const opId = typeof body.opId === 'string' ? body.opId : null;
    return ctx.service.undo(opId, origin(request));
  });
}
