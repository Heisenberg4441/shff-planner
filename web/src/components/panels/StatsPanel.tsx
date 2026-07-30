import type { ReactNode } from 'react';

import { focusCategory, gridStartMinute, summarizeDay } from '../../../../shared/src/stats';
import { fmtTime, humanDur } from '../../../../shared/src/time';
import { DAY_MINUTES } from '../../../../shared/src/types';
import { cx, vars } from '../../lib/css';
import { usePlanner } from '../../state/usePlanner';

export function StatsPanel(): ReactNode {
  const { state, blocksOf } = usePlanner();
  const blocks = blocksOf(state.date);
  const focus = focusCategory(state.categories);
  const gridStart = gridStartMinute(blocks, state.settings.dayStart);
  const summary = summarizeDay(blocks, { gridStart, focusCategoryId: focus?.id ?? null });

  const rows: Array<{ key: string; value: string; tone?: 'mute' | 'warn' | 'accent' }> = [
    { key: 'разметка', value: `${humanDur(summary.planned)} / 24 ч` },
    { key: 'вне сетки', value: humanDur(summary.offGrid), tone: 'mute' },
    { key: 'не размечено', value: humanDur(summary.gapMinutes), tone: 'warn' },
    { key: 'блоков', value: String(summary.blocks), tone: 'mute' },
    ...(focus
      ? ([
          {
            key: `${focus.id} всего`,
            value: summary.focusTotal ? humanDur(summary.focusTotal) : '—',
            tone: 'accent' as const,
          },
          {
            key: `окно ${focus.id}`,
            value: summary.focusWindow ? humanDur(summary.focusWindow) : '—',
            tone: 'accent' as const,
          },
        ])
      : []),
    { key: 'переключений', value: String(summary.switches), tone: 'mute' },
    { key: 'первая точка', value: summary.first === null ? '—' : fmtTime(summary.first), tone: 'mute' },
    { key: 'последняя', value: summary.last === null ? '—' : fmtTime(summary.last), tone: 'mute' },
  ];

  const filled = state.categories.filter((category) => (summary.byCategory[category.id] ?? 0) > 0);

  return (
    <div className="panel pl-panel">
      <div className="pl-panel-title">// СУТКИ {state.date}</div>

      <div className="pl-rows">
        {rows.map((row) => (
          <div key={row.key} className="pl-row">
            <span className="pl-row-key">{row.key}</span>
            <span className={cx('pl-row-val', row.tone)}>{row.value}</span>
          </div>
        ))}
      </div>

      <div className="pl-strip">
        {filled.map((category) => (
          <i
            key={category.id}
            style={vars({
              '--w': ((summary.byCategory[category.id] ?? 0) / DAY_MINUTES) * 100,
              '--cat': category.color,
            })}
          />
        ))}
      </div>

      {state.settings.showBalance && (
        <div className="pl-balance">
          {state.categories.map((category) => {
            const minutes = summary.byCategory[category.id] ?? 0;
            return (
              <div key={category.id} className="pl-balance-row">
                <span className="pl-dot-sq" style={vars({ '--cat': category.color })} />
                <span className="pl-balance-label" title={category.label}>
                  {category.label}
                </span>
                <span className="pl-balance-hours">{minutes ? humanDur(minutes) : '—'}</span>
                <span className="pl-balance-pct">
                  {summary.planned ? `${Math.round((minutes / summary.planned) * 100)}%` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
