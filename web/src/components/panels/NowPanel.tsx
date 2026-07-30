import type { ReactNode } from 'react';

import { fmtTime, humanDur, nowMinutes, todayKey } from '../../../../shared/src/time';
import { vars } from '../../lib/css';
import { usePlanner } from '../../state/usePlanner';

export function NowPanel(): ReactNode {
  const { state, now, blocksOf, categoryOf } = usePlanner();
  const date = state.date;
  const blocks = blocksOf(date);
  const isToday = date === todayKey(now);
  const minute = nowMinutes(now);

  const current = isToday ? blocks.find((b) => minute >= b.start && minute < b.end) : undefined;
  const next = isToday ? blocks.find((b) => b.start > minute) : blocks[0];

  const title = isToday
    ? (current?.title ?? 'Ничего не размечено')
    : 'Другие сутки — не сегодня';

  const meta = isToday
    ? current
      ? `${categoryOf(current.category).label} · ${fmtTime(current.start)}–${fmtTime(current.end)} · осталось ${humanDur(current.end - minute)}`
      : 'этот участок суток свободен'
    : `просмотр ${date}`;

  const progress = current ? ((minute - current.start) / (current.end - current.start)) * 100 : 0;

  return (
    <div className="panel pl-panel">
      <div className="pl-panel-head">
        <span className="pl-panel-title">// СЕЙЧАС</span>
        <span className="pl-panel-aside" style={{ color: 'var(--accent)' }}>
          {fmtTime(minute)}
        </span>
      </div>
      <div className="pl-now-title">{title}</div>
      <div className="pl-now-meta">{meta}</div>
      <div className="pl-progress">
        <i style={vars({ '--pct': Math.max(0, Math.min(100, progress)) })} />
      </div>
      <div className="pl-next">
        <span>дальше</span>
        <span>{next ? `${fmtTime(next.start)} · ${next.title}` : 'сутки закрыты'}</span>
      </div>
    </div>
  );
}
