import type { ReactNode } from 'react';

import {
  MONTHS_NOM,
  WD_FULL,
  addDays,
  dateKey,
  daysInMonth,
  isoWeek,
  monday,
  parseDateKey,
} from '../../../shared/src/time';
import type { ViewMode } from '../../../shared/src/types';
import { cx } from '../lib/css';
import { usePlanner } from '../state/usePlanner';

interface RangeLabel {
  main: string;
  sub: string;
}

function rangeLabel(view: ViewMode, date: string): RangeLabel {
  const d = parseDateKey(date);
  if (view === 'week') {
    const first = monday(d);
    return {
      main: `${dateKey(first)} — ${dateKey(addDays(first, 6))}`,
      sub: `неделя ${isoWeek(d)}`,
    };
  }
  if (view === 'month') {
    return {
      main: `${MONTHS_NOM[d.getMonth()]} ${d.getFullYear()}`,
      sub: `${daysInMonth(d.getFullYear(), d.getMonth())} суток`,
    };
  }
  return { main: date, sub: WD_FULL[d.getDay()] };
}

const VIEWS: Array<{ id: ViewMode; label: string }> = [
  { id: 'day', label: 'день' },
  { id: 'week', label: 'неделя' },
  { id: 'month', label: 'месяц' },
];

export function Toolbar(): ReactNode {
  const { state, actions } = usePlanner();
  const label = rangeLabel(state.view, state.date);

  return (
    <div className="pl-toolbar">
      <div className="pl-nav">
        <button
          className="chip pl-nav-arrow"
          type="button"
          onClick={() => actions.shift(-1)}
          aria-label="назад"
        >
          ‹
        </button>
        <div className="pl-range">
          <div className="pl-range-main">{label.main}</div>
          <div className="pl-range-sub">{label.sub}</div>
        </div>
        <button
          className="chip pl-nav-arrow"
          type="button"
          onClick={() => actions.shift(1)}
          aria-label="вперёд"
        >
          ›
        </button>
        <button className="chip" type="button" onClick={actions.goToday} style={{ marginLeft: 6 }}>
          сегодня
        </button>
      </div>

      <div className="pl-views">
        {VIEWS.map((view) => (
          <button
            key={view.id}
            className={cx('chip', state.view === view.id && 'active')}
            type="button"
            onClick={() => actions.setView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>

      <button
        className="btn ghost sm"
        type="button"
        onClick={() => actions.openNew(state.date, 9 * 60)}
      >
        [&nbsp;+ блок&nbsp;]
      </button>
      <button className="btn primary sm" type="button" onClick={() => actions.openDup('week', null)}>
        [&nbsp;Дублировать день →&nbsp;]
      </button>
    </div>
  );
}
