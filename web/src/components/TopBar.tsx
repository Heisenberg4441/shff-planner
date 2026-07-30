import type { ReactNode } from 'react';

import { cx } from '../lib/css';
import { usePlanner } from '../state/usePlanner';

/** Бэйдж состояния: он не декоративный, а показывает, что реально с записью. */
function SyncBadge(): ReactNode {
  const { state } = usePlanner();

  if (!state.online) {
    return (
      <span className="badge danger" title="Сервис не ответил на последний запрос">
        <span className="led" />
        offline
      </span>
    );
  }
  if (state.pending > 0) {
    return (
      <span className="badge note" title="Запись уходит на сервер">
        <span className="led" />
        saving
      </span>
    );
  }
  return (
    <span
      className="badge ok"
      title={
        state.live
          ? 'Всё записано, поток событий подключён'
          : 'Всё записано, но поток живых обновлений недоступен'
      }
    >
      <span className="led" />
      {state.live ? 'synced' : 'saved'}
    </span>
  );
}

export function TopBar(): ReactNode {
  const { state, actions } = usePlanner();

  return (
    <header className="topbar">
      <div className="wrap">
        <a className={cx('brand', 'pl-brand')} href="#" onClick={(event) => event.preventDefault()}>
          <span className="blk">SHFF</span>
          <span className="pl-brand-sub">planner</span>
        </a>
        <div className="pl-topbar-right">
          <span className="pl-topbar-tag">LOCAL · NO CLOUD</span>
          <SyncBadge />
          <button className="btn ghost sm" type="button" onClick={() => actions.openSettings(true)}>
            [&nbsp;настройки&nbsp;]
          </button>
          {state.auth?.mode === 'account' && (
            <button
              className="btn ghost sm"
              type="button"
              onClick={actions.logout}
              title={state.auth.login ? `вошёл как ${state.auth.login}` : undefined}
            >
              [&nbsp;выйти&nbsp;]
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
