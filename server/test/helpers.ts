import type { Config } from '../src/config';
import { buildApp } from '../src/app';
import type { BuiltApp } from '../src/app';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    dataDir: '.',
    dbPath: ':memory:',
    authPassword: null,
    authLogin: 'admin',
    sessionSecret: 'test-secret-not-used-in-production-0123456789',
    seed: 'none',
    logLevel: 'silent',
    trustProxy: false,
    staticDir: null,
    version: 'test',
    ...overrides,
  };
}

/** Свежий сервис, у которого доступ ещё не настроен: как при первом запуске. */
export async function makeUnconfiguredApp(overrides: Partial<Config> = {}): Promise<BuiltApp> {
  const built = buildApp(testConfig(overrides));
  await built.app.ready();
  return built;
}

/** Сервис со свободным входом — состояние, в котором живёт большинство тестов. */
export async function makeApp(overrides: Partial<Config> = {}): Promise<BuiltApp> {
  const built = await makeUnconfiguredApp(overrides);
  if (!built.ctx.auth.policy().configured) {
    await built.app.inject({ method: 'POST', url: '/api/auth/setup', payload: { mode: 'open' } });
  }
  return built;
}

export const DAY = '2026-07-30';

export function minutes(hours: number, mins = 0): number {
  return hours * 60 + mins;
}
