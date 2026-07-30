/* ============================================================
   Сборка сервиса: база → хранилища → сценарии → маршруты → статика.
   Один процесс раздаёт и API, и собранный интерфейс: self-hosted
   сервис должен быть одним контейнером и одним портом.
   ============================================================ */

import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { LogController } from 'fastify';
import type { FastifyInstance } from 'fastify';

import { ValidationError } from '../../shared/src/validate';
import { SESSION_COOKIE, createAuth, readCookie } from './auth';
import type { Config } from './config';
import { openDatabase } from './db';
import type { DB } from './db';
import { HttpError } from './errors';
import { createEvents } from './events';
import { registerAuthRoutes } from './routes/auth';
import { registerMetaRoutes } from './routes/meta';
import { registerPlannerRoutes } from './routes/planner';
import { registerSystemRoutes } from './routes/system';
import type { RouteContext } from './routes/context';
import { createService } from './service';
import { ensureSeed } from './seed';
import type { SeedReport } from './seed';
import { createAuthStore } from './store/auth';
import { createBlockStore } from './store/blocks';
import { createMetaStore } from './store/meta';
import { createOpStore } from './store/ops';

export interface BuiltApp {
  app: FastifyInstance;
  db: DB;
  ctx: RouteContext;
  seed: SeedReport;
}

/**
 * Что доступно без входа: проверка живости, состояние доступа, первичная
 * настройка, форма входа и выход. Всё остальное — только после решения
 * о доступе. Метод важен: GET /api/auth читает состояние, PATCH меняет замок.
 */
const OPEN_ROUTES = new Set([
  'GET /api/health',
  'GET /api/auth',
  'POST /api/auth/setup',
  'POST /api/auth/login',
  'POST /api/auth/logout',
]);

const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

export function buildApp(cfg: Config): BuiltApp {
  const db = openDatabase(cfg.dbPath);
  const blocks = createBlockStore(db);
  const meta = createMetaStore(db);
  const ops = createOpStore(db);
  const events = createEvents();
  const auth = createAuth({
    secret: cfg.sessionSecret,
    envPassword: cfg.authPassword,
    envLogin: cfg.authLogin,
    store: createAuthStore(db),
  });

  const app = Fastify({
    logger: { level: cfg.logLevel },
    // по строчке на каждый запрос интерфейса — это шум, а не журнал:
    // остаются только ошибки и наши собственные сообщения
    logController: new LogController({ disableRequestLogging: true }),
    routerOptions: { ignoreTrailingSlash: true },
    trustProxy: cfg.trustProxy,
    bodyLimit: 1024 * 1024,
  });

  const service = createService({ db, blocks, meta, ops, events, logger: app.log });
  const seed = ensureSeed({ db, blocks, meta, seed: cfg.seed });

  const ctx: RouteContext = {
    cfg,
    db,
    blocks,
    meta,
    events,
    service,
    auth,
    startedAt: Date.now(),
  };

  app.register(fastifyCookie);

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    if (!request.url.startsWith('/api/')) reply.header('Content-Security-Policy', CSP);
    return payload;
  });

  app.addHook('onRequest', async (request) => {
    const url = request.url.split('?')[0].replace(/\/+$/, '') || '/';
    if (!url.startsWith('/api')) return;
    if (OPEN_ROUTES.has(`${request.method} ${url}`)) return;
    auth.require(readCookie(request.headers.cookie, SESSION_COOKIE));
  });

  registerAuthRoutes(app, ctx);
  registerSystemRoutes(app, ctx);
  registerPlannerRoutes(app, ctx);
  registerMetaRoutes(app, ctx);

  if (cfg.staticDir) {
    app.register(fastifyStatic, {
      root: cfg.staticDir,
      wildcard: false,
      index: ['index.html'],
      setHeaders(reply, filePath) {
        // хешированные ассеты живут вечно, index.html не кешируется никогда
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('.html')) {
          reply.header('Cache-Control', 'no-store');
        } else {
          reply.header('Cache-Control', 'public, max-age=3600');
        }
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    const url = request.url.split('?')[0];
    if (request.method === 'GET' && !url.startsWith('/api/')) {
      if (cfg.staticDir) {
        // SPA: любой путь отдаёт index.html, маршрутизацию делает клиент
        return reply.header('Cache-Control', 'no-store').type('text/html; charset=utf-8').sendFile('index.html');
      }
      return reply
        .code(503)
        .type('text/plain; charset=utf-8')
        .send(
          'Интерфейс не собран.\n' +
            'Для разработки: npm run dev (vite отдаёт фронт на :5173).\n' +
            'Для прода: npm run build, затем npm start.\n',
        );
    }
    return reply.code(404).send({ error: 'not_found', message: 'Такого маршрута нет.' });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.status).send({
        error: error.code,
        message: error.message,
        ...(error.details ?? {}),
      });
    }
    if (error instanceof ValidationError) {
      return reply.code(400).send({ error: 'validation', message: error.message, field: error.field });
    }
    const failure = error as Error & { code?: string; statusCode?: number };
    const sqliteCode = failure.code;
    if (typeof sqliteCode === 'string' && sqliteCode.startsWith('SQLITE_CONSTRAINT')) {
      app.log.warn({ err: error, url: request.url }, 'нарушено ограничение базы');
      return reply.code(400).send({
        error: 'constraint',
        message: 'База отклонила запись: проверь границы блока и категорию.',
      });
    }
    const status = failure.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.code(status).send({ error: 'bad_request', message: failure.message });
    }
    app.log.error({ err: error, url: request.url }, 'необработанная ошибка');
    return reply.code(500).send({
      error: 'internal',
      message: 'Внутренняя ошибка сервиса. Подробности в логах контейнера.',
    });
  });

  app.addHook('onClose', async () => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      /* база уже могла закрыться */
    }
    db.close();
  });

  return { app, db, ctx, seed };
}
