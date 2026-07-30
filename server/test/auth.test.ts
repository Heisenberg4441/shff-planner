import { afterEach, describe, expect, it } from 'vitest';

import type { AuthInfo } from '../../shared/src/types';
import type { BuiltApp } from '../src/app';
import { DAY, makeApp, makeUnconfiguredApp } from './helpers';

let built: BuiltApp | null = null;

afterEach(async () => {
  await built?.app.close();
  built = null;
});

const BOOTSTRAP = `/api/bootstrap?view=day&date=${DAY}`;

function cookieOf(response: { cookies: Array<{ name: string; value: string }> }): string {
  return String(response.cookies.find((c) => c.name === 'shff_session')?.value ?? '');
}

async function authState(app: BuiltApp['app'], cookie?: string): Promise<AuthInfo> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/auth',
    ...(cookie ? { cookies: { shff_session: cookie } } : {}),
  });
  return response.json<{ auth: AuthInfo }>().auth;
}

describe('первый запуск', () => {
  it('до настройки данные не отдаются, но живость и состояние доступа видны', async () => {
    built = await makeUnconfiguredApp();
    const { app } = built;

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json<{ auth: string }>().auth).toBe('unconfigured');

    const denied = await app.inject({ method: 'GET', url: BOOTSTRAP });
    expect(denied.statusCode).toBe(401);
    expect(denied.json<{ error: string }>().error).toBe('setup_required');

    expect(await authState(app)).toMatchObject({ configured: false, source: 'none', authenticated: false });
  });

  it('«использовать без пароля» открывает планировщик и это состояние запоминается', async () => {
    built = await makeUnconfiguredApp();
    const { app } = built;

    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { mode: 'open' } });
    expect(setup.statusCode).toBe(201);
    expect(setup.json<{ auth: AuthInfo }>().auth).toMatchObject({
      configured: true,
      mode: 'open',
      authenticated: true,
    });

    expect((await app.inject({ method: 'GET', url: BOOTSTRAP })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json<{ auth: string }>().auth).toBe('open');
  });

  it('регистрация администратора запирает планировщик и сразу впускает', async () => {
    built = await makeUnconfiguredApp();
    const { app } = built;

    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { mode: 'account', login: 'михаил', password: 'freedom-at-home' },
    });
    expect(setup.statusCode).toBe(201);
    const cookie = cookieOf(setup);
    expect(cookie).toBeTruthy();
    expect(setup.cookies.find((c) => c.name === 'shff_session')?.httpOnly).toBe(true);
    expect(setup.json<{ auth: AuthInfo }>().auth).toMatchObject({
      mode: 'account',
      login: 'михаил',
      source: 'db',
      authenticated: true,
    });

    // с cookie пускает, без cookie — нет
    expect(
      (await app.inject({ method: 'GET', url: BOOTSTRAP, cookies: { shff_session: cookie } })).statusCode,
    ).toBe(200);
    const denied = await app.inject({ method: 'GET', url: BOOTSTRAP });
    expect(denied.statusCode).toBe(401);
    expect(denied.json<{ error: string }>().error).toBe('auth_required');

    // логин посторонним не показываем
    expect(await authState(app)).toMatchObject({ configured: true, mode: 'account', login: null });
  });

  it('пароль короче восьми знаков и логин с пробелом не проходят', async () => {
    built = await makeUnconfiguredApp();
    const { app } = built;

    const short = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { mode: 'account', login: 'admin', password: 'korotko' },
    });
    expect(short.statusCode).toBe(400);
    expect(short.json<{ message: string }>().message).toContain('короче');

    const spaced = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { mode: 'account', login: 'ад мин', password: 'freedom-at-home' },
    });
    expect(spaced.statusCode).toBe(400);

    // после неудач доступ всё ещё не настроен
    expect(await authState(app)).toMatchObject({ configured: false });
  });

  it('повторная настройка отбивается', async () => {
    built = await makeApp();
    const again = await built.app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { mode: 'account', login: 'admin', password: 'freedom-at-home' },
    });
    expect(again.statusCode).toBe(409);
  });
});

describe('вход и выход', () => {
  it('пускает по верным логину и паролю, отбивает неверные', async () => {
    built = await makeUnconfiguredApp();
    const { app } = built;
    await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { mode: 'account', login: 'admin', password: 'freedom-at-home' },
    });

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'admin', password: 'nope-nope-nope' },
    });
    expect(wrongPassword.statusCode).toBe(401);

    const wrongLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'stranger', password: 'freedom-at-home' },
    });
    expect(wrongLogin.statusCode).toBe(401);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      // логин не чувствителен к регистру
      payload: { login: 'ADMIN', password: 'freedom-at-home' },
    });
    expect(ok.statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: BOOTSTRAP, cookies: { shff_session: cookieOf(ok) } }))
        .statusCode,
    ).toBe(200);
  });

  it('подделанная cookie не проходит', async () => {
    built = await makeUnconfiguredApp();
    const { app } = built;
    await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { mode: 'account', login: 'admin', password: 'freedom-at-home' },
    });
    const forged = await app.inject({
      method: 'GET',
      url: BOOTSTRAP,
      cookies: { shff_session: '99999999999999.db1.поддельная-подпись' },
    });
    expect(forged.statusCode).toBe(401);
  });

  it('после десяти неудач вход отвечает 429', async () => {
    built = await makeUnconfiguredApp();
    const { app } = built;
    await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { mode: 'account', login: 'admin', password: 'freedom-at-home' },
    });

    let last = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { login: 'admin', password: 'wrong-wrong-wrong' },
      });
      last = response.statusCode;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });
});

describe('смена замка из панели', () => {
  it('ставит пароль на открытый планировщик', async () => {
    built = await makeApp();
    const { app } = built;

    const put = await app.inject({
      method: 'PATCH',
      url: '/api/auth',
      payload: { mode: 'account', login: 'admin', password: 'freedom-at-home' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json<{ auth: AuthInfo }>().auth).toMatchObject({ mode: 'account', login: 'admin' });

    expect((await app.inject({ method: 'GET', url: BOOTSTRAP })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: BOOTSTRAP, cookies: { shff_session: cookieOf(put) } }))
        .statusCode,
    ).toBe(200);
  });

  it('смена пароля требует текущий и гасит прежние сессии', async () => {
    built = await makeUnconfiguredApp();
    const { app } = built;
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { mode: 'account', login: 'admin', password: 'freedom-at-home' },
    });
    const oldCookie = cookieOf(setup);

    const wrong = await app.inject({
      method: 'PATCH',
      url: '/api/auth',
      cookies: { shff_session: oldCookie },
      payload: { mode: 'account', password: 'novy-parol-tut', currentPassword: 'не тот' },
    });
    expect(wrong.statusCode).toBe(401);

    const changed = await app.inject({
      method: 'PATCH',
      url: '/api/auth',
      cookies: { shff_session: oldCookie },
      payload: { mode: 'account', password: 'novy-parol-tut', currentPassword: 'freedom-at-home' },
    });
    expect(changed.statusCode).toBe(200);

    // старая cookie обесценилась, новая работает
    expect(
      (await app.inject({ method: 'GET', url: BOOTSTRAP, cookies: { shff_session: oldCookie } }))
        .statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: BOOTSTRAP, cookies: { shff_session: cookieOf(changed) } }))
        .statusCode,
    ).toBe(200);

    // и вход теперь по новому паролю
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { login: 'admin', password: 'novy-parol-tut' },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('снятие пароля требует текущий пароль', async () => {
    built = await makeUnconfiguredApp();
    const { app } = built;
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { mode: 'account', login: 'admin', password: 'freedom-at-home' },
    });
    const cookie = cookieOf(setup);

    const wrong = await app.inject({
      method: 'PATCH',
      url: '/api/auth',
      cookies: { shff_session: cookie },
      payload: { mode: 'open', currentPassword: 'не тот' },
    });
    expect(wrong.statusCode).toBe(401);

    const dropped = await app.inject({
      method: 'PATCH',
      url: '/api/auth',
      cookies: { shff_session: cookie },
      payload: { mode: 'open', currentPassword: 'freedom-at-home' },
    });
    expect(dropped.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: BOOTSTRAP })).statusCode).toBe(200);
  });

  it('без входа замок не поменять', async () => {
    built = await makeUnconfiguredApp();
    const { app } = built;
    await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { mode: 'account', login: 'admin', password: 'freedom-at-home' },
    });
    const attempt = await app.inject({
      method: 'PATCH',
      url: '/api/auth',
      payload: { mode: 'open', currentPassword: 'freedom-at-home' },
    });
    expect(attempt.statusCode).toBe(401);
  });
});

describe('аварийный ключ из окружения', () => {
  it('перебивает базу, не даёт настраивать доступ из панели', async () => {
    built = await makeUnconfiguredApp({ authPassword: 'iz-okruzheniya', authLogin: 'root' });
    const { app } = built;

    expect(await authState(app)).toMatchObject({ configured: true, mode: 'account', source: 'env' });
    expect((await app.inject({ method: 'GET', url: BOOTSTRAP })).statusCode).toBe(401);

    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { mode: 'open' },
    });
    expect(setup.statusCode).toBe(409);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'root', password: 'iz-okruzheniya' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = cookieOf(login);
    expect(
      (await app.inject({ method: 'GET', url: BOOTSTRAP, cookies: { shff_session: cookie } })).statusCode,
    ).toBe(200);

    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/auth',
      cookies: { shff_session: cookie },
      payload: { mode: 'open', currentPassword: 'iz-okruzheniya' },
    });
    expect(patch.statusCode).toBe(400);
    expect(patch.json<{ message: string }>().message).toContain('SHFF_AUTH_PASSWORD');
  });
});
