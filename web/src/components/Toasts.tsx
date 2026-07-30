import type { ReactNode } from 'react';

import { cx } from '../lib/css';
import { usePlanner } from '../state/usePlanner';

export function Toasts(): ReactNode {
  const { state, actions } = usePlanner();

  return (
    <div className="toast-stack">
      {state.toasts.map((toast) => (
        <div key={toast.id} className={cx('toast', toast.tone)}>
          <span className="ticon">›</span>
          <div className="tbody">
            <strong>{toast.title}</strong>
            <span>{toast.text}</span>
            {toast.opId && (
              <button
                className="pl-toast-undo"
                type="button"
                onClick={() => {
                  actions.undo(toast.opId);
                  actions.dismissToast(toast.id);
                }}
              >
                [&nbsp;отменить&nbsp;]
              </button>
            )}
          </div>
          <button
            className="tx"
            type="button"
            onClick={() => actions.dismissToast(toast.id)}
            aria-label="закрыть уведомление"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
