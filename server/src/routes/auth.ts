/* Доступ: состояние, первичная настройка, вход, выход, смена замка. */

import type { FastifyInstance, FastifyReply } from 'fastify';

import type { AuthMode } from '../../../shared/src/types';
import {
  ValidationError,
  parseAuthSetup,
  parseLogin,
  parsePassword,
} from '../../../shared/src/validate';
import { SESSION_COOKIE, SESSION_TTL_MS, readCookie } from '../auth';
import { unauthorized } from '../errors';
import type { RouteContext } from './context';

function setSession(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: 'auto',
    maxAge: Math.round(SESSION_TTL_MS / 1000),
  });
}

export function registerAuthRoutes(app: FastifyInstance, ctx: RouteContext): void {
  /** Состояние доступа. Открыто всегда: с этого начинается интерфейс. */
  app.get('/api/auth', (request) => ({
    auth: ctx.auth.info(readCookie(request.headers.cookie, SESSION_COOKIE)),
  }));

  /** Первый заход: заводим администратора либо честно объявляем свободный вход. */
  app.post('/api/auth/setup', (request, reply) => {
    const input = parseAuthSetup(request.body);
    let auth = ctx.auth.setup(input);
    if (input.mode === 'account') {
      const token = ctx.auth.issueToken();
      setSession(reply, token);
      auth = ctx.auth.info(token);
    }
    reply.code(201);
    return { auth };
  });

  app.post('/api/auth/login', (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const policy = ctx.auth.policy();
    if (!policy.configured) {
      throw new ValidationError('Доступ ещё не настроен: заведи администратора.');
    }
    if (policy.mode === 'open') {
      return { auth: ctx.auth.info(undefined) };
    }
    if (!ctx.auth.checkCredentials(body.login, body.password, request.ip)) {
      throw unauthorized('Логин или пароль не подошли.');
    }
    const token = ctx.auth.issueToken();
    setSession(reply, token);
    return { auth: ctx.auth.info(token) };
  });

  app.post('/api/auth/logout', (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { auth: { ...ctx.auth.info(undefined), authenticated: false } };
  });

  /**
   * Смена замка из панели: поставить пароль, сменить его или снять.
   * Требует входа — маршрут идёт через общий страж.
   */
  app.patch('/api/auth', (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const mode: AuthMode = body.mode === 'open' ? 'open' : 'account';

    const patch: { mode: AuthMode; login?: string; password?: string; currentPassword?: unknown } = {
      mode,
      currentPassword: body.currentPassword,
    };
    if (mode === 'account') {
      if (body.login !== undefined) patch.login = parseLogin(body.login);
      if (body.password !== undefined && body.password !== '') {
        patch.password = parsePassword(body.password);
      }
    }

    let auth = ctx.auth.update(patch, request.ip);
    // смена доступа обесценивает выданные cookie — себе выдаём новую
    if (auth.mode === 'account') {
      const token = ctx.auth.issueToken();
      setSession(reply, token);
      auth = ctx.auth.info(token);
    } else {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
    }
    return { auth };
  });
}
