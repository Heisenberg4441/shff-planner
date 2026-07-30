import type { FastifyRequest } from 'fastify';

import type { Auth } from '../auth';
import type { Config } from '../config';
import type { DB } from '../db';
import type { Events } from '../events';
import type { Service } from '../service';
import type { BlockStore } from '../store/blocks';
import type { MetaStore } from '../store/meta';

export interface RouteContext {
  cfg: Config;
  db: DB;
  blocks: BlockStore;
  meta: MetaStore;
  events: Events;
  service: Service;
  auth: Auth;
  startedAt: number;
}

/**
 * Кто прислал мутацию. Клиент помечает свои запросы, чтобы не реагировать
 * на собственное эхо в потоке событий.
 */
export function origin(request: FastifyRequest): string | null {
  const header = request.headers['x-client-id'];
  if (typeof header === 'string' && header.length <= 64) return header;
  return null;
}

export function query(request: FastifyRequest): Record<string, string> {
  const raw = (request.query ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}
