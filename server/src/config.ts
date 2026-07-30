/* ============================================================
   Конфигурация. Всё через окружение с префиксом SHFF_, всё
   необязательное. Сервис должен подниматься без единой переменной.
   ============================================================ */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  dbPath: string;
  /**
   * Аварийный пароль из окружения. null — доступом распоряжается база
   * (первый заход в панель заводит администратора или объявляет свободный вход).
   */
  authPassword: string | null;
  authLogin: string;
  sessionSecret: string;
  seed: 'none' | 'demo';
  logLevel: string;
  trustProxy: boolean;
  /** Каталог со собранным SPA. null — фронт раздаёт кто-то другой (vite в dev). */
  staticDir: string | null;
  version: string;
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

/** Ищем корень репозитория вверх от файла и от cwd — работает и в dist, и в tsx. */
function findRepoRoot(): string | null {
  const candidates = [__dirname, process.cwd()];
  for (const start of candidates) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      const pkg = path.join(dir, 'package.json');
      try {
        const raw = JSON.parse(fs.readFileSync(pkg, 'utf8')) as { name?: string };
        if (raw.name === 'shff-planner') return dir;
      } catch {
        /* идём выше */
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

function readVersion(root: string | null): string {
  if (!root) return '0.0.0';
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return raw.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function resolveStaticDir(env: NodeJS.ProcessEnv, root: string | null): string | null {
  const explicit = env.SHFF_STATIC_DIR;
  if (explicit) return path.resolve(explicit);
  const guess = root ? path.join(root, 'web', 'dist') : null;
  if (guess && fs.existsSync(path.join(guess, 'index.html'))) return guess;
  return null;
}

/**
 * Секрет подписи сессии: из окружения либо из файла в каталоге данных.
 * Файл переживает перезапуск — иначе каждый рестарт разлогинивал бы всех.
 */
function resolveSessionSecret(env: NodeJS.ProcessEnv, dataDir: string): string {
  const fromEnv = env.SHFF_SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const keyFile = path.join(dataDir, 'session.key');
  try {
    const existing = fs.readFileSync(keyFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* создадим ниже */
  }
  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(keyFile, generated + '\n', { mode: 0o600 });
  } catch {
    /* каталог только для чтения — сессии переживут только текущий процесс */
  }
  return generated;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const root = findRepoRoot();
  const dataDir = path.resolve(env.SHFF_DATA_DIR || (root ? path.join(root, 'data') : './data'));
  fs.mkdirSync(dataDir, { recursive: true });

  const password = (env.SHFF_AUTH_PASSWORD ?? '').trim();
  const seed = env.SHFF_SEED === 'demo' ? 'demo' : 'none';
  const logLevel = LOG_LEVELS.includes(env.SHFF_LOG_LEVEL ?? '') ? env.SHFF_LOG_LEVEL! : 'info';

  return {
    port: int(env.SHFF_PORT, 8787),
    host: env.SHFF_HOST || '0.0.0.0',
    dataDir,
    dbPath: env.SHFF_DB_PATH ? path.resolve(env.SHFF_DB_PATH) : path.join(dataDir, 'planner.db'),
    authPassword: password ? password : null,
    authLogin: (env.SHFF_AUTH_LOGIN ?? '').trim() || 'admin',
    sessionSecret: resolveSessionSecret(env, dataDir),
    seed,
    logLevel,
    trustProxy: bool(env.SHFF_TRUST_PROXY, false),
    staticDir: resolveStaticDir(env, root),
    version: env.SHFF_VERSION || readVersion(root),
  };
}
