import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { fmtTime, parseTimeLoose } from '../../../shared/src/time';
import { DAY_MINUTES } from '../../../shared/src/types';

/**
 * Поле времени вместо <input type="time">. Причины две: нативное поле
 * не умеет 24:00 — правую границу суток, — и не даёт набрать «930».
 * Стрелки вверх/вниз шагают по сетке, с Shift — по часу.
 */
export function TimeField({
  label,
  value,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  step: number;
  onCommit: (minutes: number) => void;
}): ReactNode {
  const [text, setText] = useState(() => fmtTime(value));

  useEffect(() => {
    setText(fmtTime(value));
  }, [value]);

  const commit = () => {
    const parsed = parseTimeLoose(text);
    if (parsed === null) {
      setText(fmtTime(value));
      return;
    }
    setText(fmtTime(parsed));
    if (parsed !== value) onCommit(parsed);
  };

  const nudge = (direction: 1 | -1, big: boolean) => {
    const base = parseTimeLoose(text) ?? value;
    const delta = direction * (big ? 60 : step);
    const next = Math.max(0, Math.min(DAY_MINUTES, base + delta));
    setText(fmtTime(next));
    onCommit(next);
  };

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        value={text}
        inputMode="numeric"
        spellCheck={false}
        autoComplete="off"
        aria-label={`${label}, часы и минуты`}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            nudge(1, event.shiftKey);
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            nudge(-1, event.shiftKey);
          }
        }}
      />
    </label>
  );
}
