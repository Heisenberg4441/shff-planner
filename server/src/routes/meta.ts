/* Настройки, категории, шаблоны суток. */

import type { FastifyInstance } from 'fastify';

import { parseCategoryInput, parseSettingsPatch, parseTemplateInput } from '../../../shared/src/validate';
import { notFound } from '../errors';
import type { RouteContext } from './context';
import { origin } from './context';

export function registerMetaRoutes(app: FastifyInstance, ctx: RouteContext): void {
  app.get('/api/settings', () => ({ settings: ctx.meta.settings() }));

  app.patch('/api/settings', (request) => {
    const patch = parseSettingsPatch(request.body);
    return { settings: ctx.service.patchSettings(patch, origin(request)) };
  });

  app.get('/api/categories', () => ({ categories: ctx.meta.categories() }));

  app.post('/api/categories', (request, reply) => {
    const input = parseCategoryInput(request.body, { requireId: true });
    const category = ctx.service.addCategory(input, origin(request));
    reply.code(201);
    return { category };
  });

  app.patch('/api/categories/:id', (request) => {
    const { id } = request.params as { id: string };
    const input = parseCategoryInput({ ...(request.body as object), id }, { requireId: true });
    return { category: ctx.service.updateCategory(input, origin(request)) };
  });

  app.delete('/api/categories/:id', (request) => {
    const { id } = request.params as { id: string };
    ctx.service.deleteCategory(id, origin(request));
    return { deleted: id };
  });

  app.get('/api/templates', () => ({ templates: ctx.meta.templates() }));

  app.post('/api/templates', (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    // «Снять шаблон с суток»: rows берём из указанного дня
    if (typeof body.fromDate === 'string' && body.rows === undefined) {
      const blocks = ctx.blocks.listDay(body.fromDate);
      body.rows = blocks.map((b) => ({
        start: b.start,
        end: b.end,
        title: b.title,
        category: b.category,
        note: b.note,
      }));
    }
    const input = parseTemplateInput(body, ctx.meta.categoryIds());
    const template = ctx.service.addTemplate(input, origin(request));
    reply.code(201);
    return { template };
  });

  app.patch('/api/templates/:id', (request) => {
    const { id } = request.params as { id: string };
    const existing = ctx.meta.template(id);
    if (!existing) throw notFound('Шаблон не найден.');
    const body = (request.body ?? {}) as Record<string, unknown>;
    const input = parseTemplateInput(
      {
        name: body.name ?? existing.name,
        note: body.note ?? existing.note,
        rows: body.rows ?? existing.rows,
      },
      ctx.meta.categoryIds(),
    );
    return { template: ctx.service.updateTemplate({ id, ...input }, origin(request)) };
  });

  app.delete('/api/templates/:id', (request) => {
    const { id } = request.params as { id: string };
    const op = ctx.service.deleteTemplate(id, origin(request));
    return { deleted: id, op };
  });
}
