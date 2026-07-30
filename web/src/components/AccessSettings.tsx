/* ============================================================
   Раздел «доступ» в настройках: поставить пароль, сменить его,
   снять. Снятие и смена требуют текущий пароль — забытая открытая
   вкладка не должна становиться потерей замка.
   ============================================================ */

import { useState } from 'react';
import type { ReactNode } from 'react';

import { LOGIN_RE, MIN_PASSWORD_LENGTH } from '../../../shared/src/validate';
import { usePlanner } from '../state/usePlanner';

export function AccessSettings(): ReactNode {
  const { state, actions } = usePlanner();
  const auth = state.auth;

  const [login, setLogin] = useState(auth?.login ?? 'admin');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dropConfirm, setDropConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!auth) return null;

  const hasPassword = auth.mode === 'account';

  const reset = () => {
    setCurrent('');
    setNext('');
    setRepeat('');
    setError(null);
    setDropConfirm(false);
  };

  const applyPassword = async () => {
    if (!LOGIN_RE.test(login.trim())) {
      setError('Логин: от 2 до 32 знаков без пробелов.');
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль короче ${MIN_PASSWORD_LENGTH} знаков.`);
      return;
    }
    if (next !== repeat) {
      setError('Пароли не совпали.');
      return;
    }
    setError(null);
    setBusy(true);
    const ok = await actions.updateAuth({
      mode: 'account',
      login: login.trim(),
      password: next,
      ...(hasPassword ? { currentPassword: current } : {}),
    });
    setBusy(false);
    if (ok) reset();
  };

  const dropPassword = async () => {
    if (!dropConfirm) {
      setDropConfirm(true);
      return;
    }
    setBusy(true);
    const ok = await actions.updateAuth({ mode: 'open', currentPassword: current });
    setBusy(false);
    if (ok) reset();
  };

  return (
    <div className="pl-access">
      <div className="pl-panel-title">// ДОСТУП</div>

      <div className="pl-rows" style={{ marginBottom: 12 }}>
        <div className="pl-row">
          <span className="pl-row-key">вход</span>
          <span className={hasPassword ? 'pl-row-val accent' : 'pl-row-val warn'}>
            {hasPassword ? 'по паролю' : 'свободный'}
          </span>
        </div>
        {auth.login && (
          <div className="pl-row">
            <span className="pl-row-key">логин</span>
            <span className="pl-row-val">{auth.login}</span>
          </div>
        )}
        <div className="pl-row">
          <span className="pl-row-key">откуда</span>
          <span className="pl-row-val mute">
            {auth.source === 'env' ? 'переменная окружения' : 'база планировщика'}
          </span>
        </div>
      </div>

      {auth.source === 'env' ? (
        <p className="pl-note">
          // пароль задан переменной SHFF_AUTH_PASSWORD — панель им не распоряжается. Убери переменную
          из окружения, чтобы вернуть управление сюда.
        </p>
      ) : (
        <>
          {!hasPassword && (
            <p className="pl-note" style={{ marginBottom: 10 }}>
              // сейчас планировщик открыт любому, кто дотянется до порта
            </p>
          )}

          <div className="pl-settings-grid">
            <label className="field">
              <span className="field-label">Логин</span>
              <input
                className="input"
                value={login}
                spellCheck={false}
                autoComplete="username"
                onChange={(event) => setLogin(event.target.value)}
              />
            </label>

            {hasPassword && (
              <label className="field">
                <span className="field-label">Текущий пароль</span>
                <input
                  className="input"
                  type="password"
                  value={current}
                  autoComplete="current-password"
                  onChange={(event) => setCurrent(event.target.value)}
                />
              </label>
            )}

            <label className="field">
              <span className="field-label">{hasPassword ? 'Новый пароль' : 'Пароль'}</span>
              <input
                className="input"
                type="password"
                value={next}
                autoComplete="new-password"
                onChange={(event) => setNext(event.target.value)}
              />
            </label>

            <label className="field">
              <span className="field-label">Ещё раз</span>
              <input
                className="input"
                type="password"
                value={repeat}
                autoComplete="new-password"
                onChange={(event) => setRepeat(event.target.value)}
              />
            </label>
          </div>

          {error && (
            <div className="pl-callout" style={{ marginTop: 12 }}>
              <span className="pl-callout-tag">НЕ ВЫШЛО</span>
              <div className="pl-callout-text">{error}</div>
            </div>
          )}

          <div className="pl-chips" style={{ marginTop: 12 }}>
            <button
              className="btn primary sm"
              type="button"
              disabled={busy}
              onClick={() => void applyPassword()}
            >
              {hasPassword ? '[ Сменить пароль ]' : '[ Поставить пароль ]'}
            </button>
            {hasPassword && (
              <button
                className={dropConfirm ? 'btn ghost danger sm' : 'btn ghost sm'}
                type="button"
                disabled={busy}
                onClick={() => void dropPassword()}
              >
                {dropConfirm ? '[ Точно снять замок? ]' : '[ Снять пароль ]'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
