/* Неделя: семь колонок суток, шаг сетки — час. Клик по шапке
   открывает день, клик по часу ставит блок сразу в нужный день. */

import type { ReactNode } from 'react';

import { gridStartMinute, plannedMinutes } from '../../../shared/src/stats';
import {
  WD_SHORT,
  addDays,
  dateKey,
  fmtTime,
  humanDur,
  monday,
  pad,
  parseDateKey,
  todayKey,
} from '../../../shared/src/time';
import { DAY_MINUTES } from '../../../shared/src/types';
import type { Block } from '../../../shared/src/types';
import { cx, vars } from '../lib/css';
import { usePlanner } from '../state/usePlanner';

const HOUR_PX = 40;
const PPM = HOUR_PX / 60;

export function WeekGrid(): ReactNode {
  const { state, now, actions, blocksOf, categoryOf } = usePlanner();
  const first = monday(parseDateKey(state.date));
  const days = Array.from({ length: 7 }, (_, index) => dateKey(addDays(first, index)));
  const today = todayKey(now);

  const gridStart = gridStartMinute(
    days.flatMap((day) => blocksOf(day)),
    state.settings.dayStart,
  );

  const hours: number[] = [];
  for (let hour = gridStart / 60; hour < 24; hour++) hours.push(hour);

  return (
    <>
      <div className="pl-window">
        <div className="pl-week-head">
          <div className="pl-week-gutter" />
          {days.map((day) => {
            const blocks = blocksOf(day);
            const planned = plannedMinutes(blocks);
            const d = parseDateKey(day);
            return (
              <button
                key={day}
                type="button"
                className={cx('pl-week-day', day === state.date && 'sel', day === today && 'today')}
                onClick={() => actions.openDay(day)}
                title={`открыть ${day}`}
              >
                <div className="pl-week-wd">{WD_SHORT[d.getDay()]}</div>
                <div className="pl-week-num">
                  {pad(d.getDate())}.{pad(d.getMonth() + 1)}
                </div>
                <div className="pl-week-load">{planned ? humanDur(planned) : '// пусто'}</div>
              </button>
            );
          })}
        </div>

        <div className="pl-week-scroll">
          <div className="pl-week-body">
            <div className="pl-week-gutter">
              {hours.map((hour) => (
                <div key={hour} className="pl-week-hour">
                  {pad(hour)}:00
                </div>
              ))}
            </div>

            {days.map((day) => (
              <div key={day} className={cx('pl-week-col', day === state.date && 'sel')}>
                {hours.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    className={cx('pl-week-slot', hour % 3 === 0 && 'major')}
                    onClick={() => actions.openNew(day, hour * 60)}
                    title={`${day} · поставить блок с ${pad(hour)}:00`}
                    aria-label={`${day} ${pad(hour)}:00`}
                  />
                ))}
                {blocksOf(day).map((block) => (
                  <WeekBlock
                    key={block.id}
                    day={day}
                    block={block}
                    gridStart={gridStart}
                    color={categoryOf(block.category).color}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="pl-undergrid">
        <span>// клик по колонке — открыть день, клик по часу — новый блок</span>
        <button className="btn ghost sm" type="button" onClick={() => actions.openDup('weekdays', null)}>
          [&nbsp;Дублировать неделю →&nbsp;]
        </button>
      </div>
    </>
  );
}

function WeekBlock({
  day,
  block,
  gridStart,
  color,
}: {
  day: string;
  block: Block;
  gridStart: number;
  color: string;
}): ReactNode {
  const { actions } = usePlanner();
  const height = Math.max(14, (block.end - block.start) * PPM - 2);
  const clipped = Math.max(0, Math.min(block.start, DAY_MINUTES) - gridStart);
  const showTime = height >= 34;
  // строка моно-текста здесь — 13px: считаем, сколько их влезет под заголовок
  const lines = Math.max(1, Math.floor((height - (showTime ? 17 : 4)) / 13));

  return (
    <div
      className="pl-block pl-week-block"
      style={vars({
        '--top': clipped * PPM + 1,
        '--h': height,
        '--cat': color,
        '--inset-l': '3px',
        '--inset-r': '3px',
        '--pad': '2px 5px',
        '--lines': lines,
      })}
      onClick={() => actions.openEdit(day, block)}
      title={`${block.title} · ${fmtTime(block.start)}–${fmtTime(block.end)} · ${humanDur(block.end - block.start)}`}
    >
      <span className="pl-block-title">{block.title}</span>
      {showTime && (
        <span className="pl-block-time">
          {fmtTime(block.start)}–{fmtTime(block.end)} · {humanDur(block.end - block.start)}
        </span>
      )}
    </div>
  );
}
