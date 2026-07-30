/* Месяц: 6×7 суток, каждая — полоса плотности по категориям
   и две первые строки разметки. Клик по клетке открывает день. */

import type { ReactNode } from 'react';

import { categoryMinutes, plannedMinutes } from '../../../shared/src/stats';
import {
  WD_SHORT,
  addDays,
  dateKey,
  fmtTime,
  humanDur,
  monday,
  parseDateKey,
  todayKey,
} from '../../../shared/src/time';
import { DAY_MINUTES } from '../../../shared/src/types';
import { cx, vars } from '../lib/css';
import { usePlanner } from '../state/usePlanner';

const WEEKDAY_HEAD = [1, 2, 3, 4, 5, 6, 0];

export function MonthGrid(): ReactNode {
  const { state, now, actions, blocksOf, categoryOf } = usePlanner();
  const anchor = parseDateKey(state.date);
  const first = monday(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const today = todayKey(now);
  const cells = Array.from({ length: 42 }, (_, index) => addDays(first, index));

  return (
    <>
      <div className="pl-window">
        <div className="pl-month-head">
          {WEEKDAY_HEAD.map((weekday) => (
            <div key={weekday} className={cx('pl-month-wd', (weekday === 6 || weekday === 0) && 'weekend')}>
              {WD_SHORT[weekday]}
            </div>
          ))}
        </div>

        <div className="pl-month">
          {cells.map((cellDate) => {
            const day = dateKey(cellDate);
            const blocks = blocksOf(day);
            const planned = plannedMinutes(blocks);
            const byCategory = categoryMinutes(blocks);
            const outside = cellDate.getMonth() !== anchor.getMonth();

            return (
              <button
                key={day}
                type="button"
                className={cx(
                  'pl-month-cell',
                  outside && 'out',
                  day === state.date && 'sel',
                  day === today && 'today',
                )}
                onClick={() => actions.openDay(day)}
                title={`открыть ${day}`}
              >
                <div className="pl-month-top">
                  <span className="pl-month-num">{cellDate.getDate()}</span>
                  <span className="pl-month-load">{planned ? humanDur(planned) : ''}</span>
                </div>

                <div className="pl-strip">
                  {state.categories
                    .filter((category) => (byCategory[category.id] ?? 0) > 0)
                    .map((category) => (
                      <i
                        key={category.id}
                        style={vars({
                          '--w': ((byCategory[category.id] ?? 0) / DAY_MINUTES) * 100,
                          '--cat': category.color,
                        })}
                      />
                    ))}
                </div>

                <div className="pl-month-peek">
                  {blocks.slice(0, 2).map((block) => (
                    <div
                      key={block.id}
                      className="pl-peek"
                      style={vars({ '--cat': categoryOf(block.category).color })}
                    >
                      {fmtTime(block.start)} · {humanDur(block.end - block.start)} · {block.title}
                    </div>
                  ))}
                </div>

                {blocks.length > 2 && <div className="pl-month-more">// ещё {blocks.length - 2}</div>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pl-undergrid">
        <span>// цветная полоса — плотность суток по категориям</span>
        <button className="btn ghost sm" type="button" onClick={() => actions.openDup('month', null)}>
          [&nbsp;Раскатать день на месяц →&nbsp;]
        </button>
      </div>
    </>
  );
}
