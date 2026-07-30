/* ============================================================
   Первый запуск. Пока решение о доступе не принято, планировщик
   не отдаёт данные никому — поэтому это первое, что видно.

   Второй путь («без пароля») не спрятан и не обозван небезопасным
   петитом: в домашней сети это нормальный выбор. Но подтверждается
   он вторым нажатием — чтобы это было решением, а не промахом.
   ============================================================ */

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { LOGIN_RE, MIN_PASSWORD_LENGTH } from '../../../shared/src/validate';
import { usePlanner } from '../state/usePlanner';

export function Setup(): ReactNode {
  const { state, actions } = usePlanner();
  const [login, setLogin] = useState('admin');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    if (!LOGIN_RE.test(login.trim())) {
      setError('Логин: от 2 до 32 знаков без пробелов.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль короче ${MIN_PASSWORD_LENGTH} знаков.`);
      return;
    }
    if (password !== repeat) {
      setError('Пароли не совпали.');
      return;
    }

    setError(null);
    setBusy(true);
    const ok = await actions.setupAccount(login.trim(), password);
    setBusy(false);
    if (!ok) {
      setPassword('');
      setRepeat('');
    }
  };

  const chooseOpen = async () => {
    if (!openConfirm) {
      setOpenConfirm(true);
      return;
    }
    setBusy(true);
    await actions.setupOpen();
    setBusy(false);
  };

  return (
    <div className="pl-gate">
      {state.settings.crt && <div className="scanlines" />}
      <div className="pl-window pl-gate-window pl-gate-wide">
        <div className="pl-window-bar">
          <span className="pl-dot r" />
          <span className="pl-dot y" />
          <span className="pl-dot g" />
          <span className="pl-window-path">shff-plan init</span>
        </div>

        <div className="pl-gate-body">
          <span className="pl-kicker">
            $ shff-plan init --first-run<span className="pl-caret">_</span>
          </span>
          <h1 className="pl-gate-title">Кто здесь хозяин</h1>
          <p className="pl-gate-lede">
            База пустая, замка ещё нет. Заведи администратора — логин и пароль лягут в ту же базу,
            что и разметка, и переедут вместе с томом. Или оставь вход свободным, если планировщик
            живёт в доверенной сети.
          </p>

          <form className="pl-fields" onSubmit={submit}>
            <label className="field">
              <span className="field-label">Логин</span>
              <input
                className="input"
                value={login}
                autoFocus
                autoComplete="username"
                spellCheck={false}
                onChange={(event) => setLogin(event.target.value)}
              />
            </label>

            <div className="pl-times pl-setup-pair">
              <label className="field">
                <span className="field-label">Пароль</span>
                <input
                  className="input"
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  onChange={(event) => setPassword(event.target.value)}
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

            <span className="pl-note">
              // не короче {MIN_PASSWORD_LENGTH} знаков · сессия живёт 30 дней в HttpOnly-cookie
            </span>

            {error && (
              <div className="pl-callout">
                <span className="pl-callout-tag">НЕ ВЫШЛО</span>
                <div className="pl-callout-text">{error}</div>
              </div>
            )}

            <button className="btn primary sm block" type="submit" disabled={busy}>
              {busy ? '[ минуту… ]' : '[ Создать администратора → ]'}
            </button>
          </form>

          <div className="pl-gate-split">
            <span>// или</span>
          </div>

          <button
            className={openConfirm ? 'btn ghost danger sm block' : 'btn ghost sm block'}
            type="button"
            disabled={busy}
            onClick={() => void chooseOpen()}
          >
            {openConfirm ? '[ Да, без пароля — я в доверенной сети ]' : '[ Использовать без пароля ]'}
          </button>
          <span className="pl-note">
            {openConfirm
              ? '// любой, кто дотянется до порта, сможет читать и править твои сутки'
              : '// пароль можно поставить потом: настройки → доступ'}
          </span>
        </div>
      </div>
    </div>
  );
}
