import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { usePlanner } from '../state/usePlanner';

export function Login(): ReactNode {
  const { state, actions } = usePlanner();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const fromEnv = state.auth?.source === 'env';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!login || !password || busy) return;
    setBusy(true);
    const ok = await actions.login(login.trim(), password);
    setBusy(false);
    if (!ok) setPassword('');
  };

  return (
    <div className="pl-gate">
      {state.settings.crt && <div className="scanlines" />}
      <div className="pl-window pl-gate-window">
        <div className="pl-window-bar">
          <span className="pl-dot r" />
          <span className="pl-dot y" />
          <span className="pl-dot g" />
          <span className="pl-window-path">shff-plan login</span>
        </div>
        <form className="pl-gate-body" onSubmit={submit}>
          <h1 className="pl-gate-title">Планировщик заперт</h1>
          <p className="pl-gate-lede">
            {fromEnv
              ? 'Логин и пароль заданы переменными окружения контейнера.'
              : 'Сессия живёт 30 дней в HttpOnly-cookie. Забыл пароль — задай SHFF_AUTH_PASSWORD в окружении и войди аварийным ключом.'}
          </p>

          <label className="field">
            <span className="field-label">Логин</span>
            <span className="input-prompt">
              <span className="ps">$</span>
              <input
                className="input"
                autoFocus
                autoComplete="username"
                spellCheck={false}
                value={login}
                onChange={(event) => setLogin(event.target.value)}
              />
            </span>
          </label>

          <label className="field">
            <span className="field-label">Пароль</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button className="btn primary sm block" type="submit" disabled={busy || !login || !password}>
            {busy ? '[ проверяю… ]' : '[ Войти → ]'}
          </button>
        </form>
      </div>
    </div>
  );
}
