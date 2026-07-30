import type { ReactNode } from 'react';

import { cx } from '../lib/css';

/** Окно диалога в идиоме дизайн-системы: рамка терминала, три мёртвые точки, ✕. */
export function Dialog({
  bar,
  title,
  lede,
  width = 560,
  scroll = false,
  onClose,
  footer,
  children,
}: {
  bar: string;
  title: string;
  lede?: ReactNode;
  width?: number;
  scroll?: boolean;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="dlg-back open" onClick={onClose}>
      <div
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width: `min(${width}px, 100%)` }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dlg-bar">
          <span className="dot r" />
          <span className="dot y" />
          <span className="dot g" />
          <span className="t">{bar}</span>
          <button className="x" type="button" onClick={onClose} aria-label="закрыть">
            ✕
          </button>
        </div>
        <div className={cx('dlg-body', scroll && 'pl-dlg-scroll')}>
          <h3 className="pl-dlg-h3">{title}</h3>
          {lede && <p className="pl-dlg-lede">{lede}</p>}
          {children}
        </div>
        <div className="dlg-foot">{footer}</div>
      </div>
    </div>
  );
}
