/* ============================================================
   Сутки поминутно. Одна ячейка — один шаг сетки (15 или 30 минут),
   блоки лежат абсолютом поверх ячеек. Геометрия приходит в CSS
   переменными: --hour-h, --slot-h, --top, --h.
   ============================================================ */

import type { ReactNode } from 'react';

import { pluralBlocks } from '../../../shared/src/plural';
import { gridStartMinute, plannedMinutes } from '../../../shared/src/stats';
import { fmtTime, humanDur, nowMinutes, pad, todayKey } from '../../../shared/src/time';
import { DAY_MINUTES } from '../../../shared/src/types';
import type { Block } from '../../../shared/src/types';
import { cx, vars } from '../lib/css';
import { usePlanner } from '../state/usePlanner';

const SLOT_PX = 26;

export function DayGrid(): ReactNode {
  const { state, now, actions, blocksOf, isLoaded } = usePlanner();
  const date = state.date;
  const blocks = blocksOf(date);
  const step = state.settings.slotMinutes;
  const ppm = SLOT_PX / step;
  const gridStart = gridStartMinute(blocks, state.settings.dayStart);
  const planned = plannedMinutes(blocks);
  const isToday = date === todayKey(now);
  const minuteNow = nowMinutes(now);

  const hours: number[] = [];
  for (let h = gridStart / 60; h < 24; h++) hours.push(h);

  const slots: number[] = [];
  for (let t = gridStart; t < DAY_MINUTES; t += step) slots.push(t);

  const busyAt = (minute: number) => blocks.some((b) => minute >= b.start && minute < b.end);

  return (
    <div className="pl-window">
      <div className="pl-window-bar">
        <span className="pl-dot r" />
        <span className="pl-dot y" />
        <span className="pl-dot g" />
        <span className="pl-window-path">
          ~/planner/{date} — {pluralBlocks(blocks.length)}, {humanDur(planned)}
        </span>
        <span className="pl-window-hint">// клик по пустой ячейке — новый блок</span>
      </div>

      <div className="pl-day-scroll">
        <div className="pl-day" style={vars({ '--hour-h': 60 * ppm, '--slot-h': SLOT_PX })}>
          <div className="pl-hours">
            {hours.map((hour) => (
              <div
                key={hour}
                className={cx('pl-hour', isToday && hour === Math.floor(minuteNow / 60) && 'is-now')}
              >
                {pad(hour)}:00
              </div>
            ))}
          </div>

          <div className="pl-slots">
            {slots.map((minute) => {
              const busy = busyAt(minute);
              return (
                <button
                  key={minute}
                  type="button"
                  className={cx('pl-slot', minute % 60 === 0 && 'major', busy && 'busy')}
                  onClick={() => {
                    if (!busy) actions.openNew(date, minute);
                  }}
                  tabIndex={busy ? -1 : 0}
                  aria-hidden={busy}
                  title={busy ? undefined : `поставить блок с ${fmtTime(minute)}`}
                >
                  {!busy && (
                    <span>
                      + {fmtTime(minute)} + {humanDur(step)}
                    </span>
                  )}
                </button>
              );
            })}

            {blocks.map((block) => (
              <DayBlock key={block.id} block={block} gridStart={gridStart} ppm={ppm} />
            ))}

            {isToday && minuteNow >= gridStart && (
              <div className="pl-now" style={vars({ '--top': (minuteNow - gridStart) * ppm })}>
                <span className="pl-now-dot" />
                <span className="pl-now-label">{fmtTime(minuteNow)}</span>
              </div>
            )}

            {!blocks.length && isLoaded(date) && (
              <div className="pl-empty-overlay">
                <div className="pl-empty-title">// сутки не размечены</div>
                <div className="pl-empty-hint">
                  клик по ячейке ставит блок · шаблон справа размечает день целиком
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayBlock({
  block,
  gridStart,
  ppm,
}: {
  block: Block;
  gridStart: number;
  ppm: number;
}): ReactNode {
  const { state, actions, categoryOf } = usePlanner();
  const category = categoryOf(block.category);
  const height = Math.max(14, (block.end - block.start) * ppm - 2);
  const duration = block.end - block.start;

  return (
    <div
      className="pl-block"
      style={vars({
        '--top': (block.start - gridStart) * ppm + 1,
        '--h': height,
        '--cat': category.color,
        '--pad': height > 34 ? '5px 8px' : '2px 8px',
        '--inset-l': '10px',
        '--inset-r': '12px',
        cursor: 'pointer',
      })}
      onClick={() => actions.openEdit(state.date, block)}
      title={`${block.title} · ${fmtTime(block.start)}–${fmtTime(block.end)} · ${humanDur(duration)}`}
    >
      <div className="pl-block-head">
        <span className="pl-block-title">{block.title}</span>
        <span className="pl-block-time">
          {fmtTime(block.start)}–{fmtTime(block.end)} <span className="pl-block-dur">+{humanDur(duration)}</span>
        </span>
        <span className="pl-block-actions">
          <button
            className="pl-mini"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              actions.openEdit(state.date, block);
            }}
          >
            правка
          </button>
          <button
            className="pl-mini"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              actions.openDup('weekdays', block.id, state.date);
            }}
          >
            дубль
          </button>
          <button
            className="pl-mini danger"
            type="button"
            aria-label={`снять блок ${block.title}`}
            onClick={(event) => {
              event.stopPropagation();
              actions.removeBlock(block);
            }}
          >
            ✕
          </button>
        </span>
      </div>
      {height > 46 && (
        <span className="pl-block-cat">
          // {category.label}
          {block.note ? ` · ${block.note}` : ''}
        </span>
      )}
    </div>
  );
}
