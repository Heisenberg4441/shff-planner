import type { ReactNode } from 'react';

import { dayGaps, gapMinutes, gridStartMinute } from '../../../../shared/src/stats';
import { fmtTime, humanDur } from '../../../../shared/src/time';
import { usePlanner } from '../../state/usePlanner';

const SHOWN = 5;

export function GapsPanel(): ReactNode {
  const { state, actions, blocksOf } = usePlanner();
  const blocks = blocksOf(state.date);
  const gridStart = gridStartMinute(blocks, state.settings.dayStart);
  const gaps = dayGaps(blocks, gridStart);
  const total = gapMinutes(gaps);

  return (
    <div className="panel pl-panel">
      <div className="pl-panel-head">
        <span className="pl-panel-title">// ДЫРЫ В РАЗМЕТКЕ</span>
        <span className="pl-panel-aside" style={{ color: 'var(--warn)' }}>
          {total ? humanDur(total) : '0 мин'}
        </span>
      </div>

      <div className="pl-list">
        {gaps.slice(0, SHOWN).map((gap) => (
          <button
            key={`${gap.start}-${gap.end}`}
            type="button"
            className="pl-list-btn"
            onClick={() => actions.openNew(state.date, gap.start, gap.end)}
            title={`заполнить ${fmtTime(gap.start)}–${fmtTime(gap.end)}`}
          >
            <span className="k">
              {fmtTime(gap.start)}–{fmtTime(gap.end)}
            </span>
            <span className="v">{humanDur(gap.end - gap.start)}</span>
          </button>
        ))}
      </div>

      {!gaps.length && <div className="pl-note">// сутки размечены целиком</div>}
      {gaps.length > SHOWN && <div className="pl-note">// ещё {gaps.length - SHOWN}</div>}
    </div>
  );
}
