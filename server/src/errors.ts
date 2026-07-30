/* Ошибки с кодом и человеческим текстом: тот же текст уезжает в тост. */

import type { Block } from '../../shared/src/types';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | null;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

export function badRequest(message: string, details?: Record<string, unknown>): HttpError {
  return new HttpError(400, 'bad_request', message, details ?? null);
}

export function unauthorized(message = 'Нужен вход.'): HttpError {
  return new HttpError(401, 'auth_required', message);
}

/** Первый запуск: решение о доступе ещё не принято, данные не отдаём. */
export function setupRequired(
  message = 'Планировщик ещё не настроен: заведи администратора или выбери работу без пароля.',
): HttpError {
  return new HttpError(401, 'setup_required', message);
}

export function alreadyDone(message: string): HttpError {
  return new HttpError(409, 'already_done', message);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, 'not_found', message);
}

export function conflict(message: string, conflicts: Block[]): HttpError {
  return new HttpError(409, 'conflict', message, { conflicts });
}

export function tooMany(message: string): HttpError {
  return new HttpError(429, 'too_many_requests', message);
}
