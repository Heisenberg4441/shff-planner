/* Здоровье, вход, поток событий, бекап. */

import type { FastifyInstance } from 'fastify';

import type { HealthReport } from '../../../shared/src/types';
import { databaseSize } from '../db';
import { badRequest } from '../errors';
import { parseImportBundle } from '../import';
import type { RouteContext } from './context';
import { origin } from './context';

const IMPORT_BODY_LIMIT = 32 * 1024 * 1024;
const SSE_PING_MS = 25000;

export function registerSystemRoutes(app: FastifyInstance, ctx: RouteContext): void {
  app.get('/api/health', (): HealthReport => {
    let blocks = -1;
    let status: 'ok' | 'degraded' = 'ok';
    try {
      blocks = ctx.service.stats().blocks;
    } catch {
      status = 'degraded';
    }
    const policy = ctx.auth.policy();
    return {
      status,
      version: ctx.cfg.version,
      uptimeSec: Math.round((Date.now() - ctx.startedAt) / 1000),
      time: new Date().toISOString(),
      db: { path: ctx.cfg.dbPath, blocks, sizeBytes: databaseSize(ctx.cfg.dbPath) },
      auth: policy.configured ? policy.mode : 'unconfigured',
    };
  });

  /* ---------- поток событий ---------- */

  const closers = new Set<() => void>();
  app.addHook('onClose', async () => {
    for (const close of [...closers]) close();
  });

  app.get('/api/events', (request, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    res.write(`event: hello\ndata: ${JSON.stringify({ revision: ctx.events.revision })}\n\n`);

    const unsubscribe = ctx.events.subscribe({ write: (chunk) => res.write(chunk) });
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        /* закроется по 'close' */
      }
    }, SSE_PING_MS);
    ping.unref();

    const cleanup = () => {
      if (!closers.has(cleanup)) return;
      closers.delete(cleanup);
      clearInterval(ping);
      unsubscribe();
      try {
        res.end();
      } catch {
        /* уже закрыт */
      }
    };
    closers.add(cleanup);
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
  });

  /* ---------- бекап ---------- */

  app.get('/api/export', (_request, reply) => {
    const bundle = ctx.service.exportAll();
    const stamp = new Date().toISOString().slice(0, 10);
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="shff-planner-${stamp}.json"`);
    return bundle;
  });

  app.post('/api/import', { bodyLimit: IMPORT_BODY_LIMIT }, (request) => {
    const parsed = parseImportBundle(request.body, ctx.meta.categoryIds());
    if (!parsed.blocks.length && !parsed.categories.length && !parsed.templates.length) {
      throw badRequest('В файле нет ни блоков, ни категорий, ни шаблонов.');
    }
    const result = ctx.service.importBundle(parsed, parsed.mode, origin(request));
    return { ...result, imported: { blocks: parsed.blocks.length, mode: parsed.mode } };
  });
}
