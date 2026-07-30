import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import { planOverlaps } from '../../../shared/src/overlap';
import { MONTHS_GEN, WD_FULL, fmtTime, humanDur, parseDateKey } from '../../../shared/src/time';
import { DAY_MINUTES } from '../../../shared/src/types';
import { cx, vars } from '../lib/css';
import { usePlanner } from '../state/usePlanner';
import { Dialog } from './Dialog';
import { TimeField } from './TimeField';

const NUDGES = [15, 30, 45, 60, 90, 120];

export function BlockDialog(): ReactNode {
  const { state, actions, blocksOf } = usePlanner();
  const dialog = state.dialog;
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  if (!dialog) return null;

  const date = parseDateKey(dialog.date);
  const isEdit = dialog.mode === 'edit';
  const duration = Math.max(0, dialog.end - dialog.start);

  const others = blocksOf(dialog.date).filter((block) => block.id !== dialog.id);
  const plan = planOverlaps(others, [{ start: dialog.start, end: dialog.end }]);
  const removedIds = new Set(plan.removed.map((block) => block.id));
  const conflictText = plan.affected.length
    ? 'Пересекается с ' +
      plan.affected
        .map(
          (block) =>
            `${block.title} (${fmtTime(block.start)}–${fmtTime(block.end)}) — ${
              removedIds.has(block.id) ? 'снимется целиком' : 'подрежется'
            }`,
        )
        .join('; ') +
      '.'
    : '';

  return (
    <Dialog
      bar={`shff-plan ${isEdit ? 'edit' : 'add'} ${dialog.date}`}
      title={isEdit ? 'Правка блока' : 'Новый блок в сутках'}
      lede={`${WD_FULL[date.getDay()]}, ${date.getDate()} ${MONTHS_GEN[date.getMonth()]} — поминутно, без «на весь день».`}
      width={660}
      scroll
      onClose={actions.closeDialog}
      footer={
        <>
          {isEdit && (
            <button
              className="btn ghost danger sm"
              type="button"
              onClick={actions.deleteFromDialog}
              style={{ marginRight: 'auto' }}
            >
              [&nbsp;Удалить&nbsp;]
            </button>
          )}
          {isEdit && (
            <button
              className="btn ghost sm"
              type="button"
              onClick={() => actions.openDup('weekdays', dialog.id, dialog.date)}
            >
              [&nbsp;Дублировать блок&nbsp;]
            </button>
          )}
          <button className="btn ghost sm" type="button" onClick={actions.closeDialog}>
            [&nbsp;Отмена&nbsp;]
          </button>
          <button className="btn primary sm" type="button" onClick={actions.saveDialog}>
            [&nbsp;Сохранить →&nbsp;]
          </button>
        </>
      }
    >
      <div className="pl-fields">
        <label className="field">
          <span className="field-label">Что делаешь</span>
          <input
            ref={titleRef}
            className="input"
            value={dialog.title}
            placeholder="напр. deep: миграция на Nextcloud"
            onChange={(event) => actions.patchDialog({ title: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') actions.saveDialog();
            }}
          />
        </label>

        <div>
          <span className="field-label pl-section-label">Категория</span>
          <div className="pl-chips">
            {state.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={cx('pl-cat-opt', dialog.category === category.id && 'on')}
                style={vars({ '--cat': category.color })}
                onClick={() => actions.patchDialog({ category: category.id })}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pl-times">
          <TimeField
            label="Начало"
            value={dialog.start}
            step={state.settings.slotMinutes}
            onCommit={(start) => actions.patchDialog({ start })}
          />
          <TimeField
            label="Конец"
            value={dialog.end}
            step={state.settings.slotMinutes}
            onCommit={(end) => actions.patchDialog({ end })}
          />
          <div className="pl-dur">= {humanDur(duration)}</div>
        </div>

        <div className="pl-chips">
          {NUDGES.map((minutes) => (
            <button
              key={minutes}
              className="chip"
              type="button"
              onClick={() =>
                actions.patchDialog({ end: Math.min(DAY_MINUTES, dialog.start + minutes) })
              }
            >
              {minutes} мин
            </button>
          ))}
        </div>

        <label className="field">
          <span className="field-label">
            Заметка <span style={{ color: 'var(--faint)' }}>// необязательно</span>
          </span>
          <input
            className="input"
            value={dialog.note}
            placeholder="что считать выполненным"
            onChange={(event) => actions.patchDialog({ note: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') actions.saveDialog();
            }}
          />
        </label>

        {conflictText && (
          <div className="pl-callout">
            <span className="pl-callout-tag">ВНИМАНИЕ</span>
            <div className="pl-callout-text">
              {conflictText} Сутки — это разбиение: два дела не могут занимать одну минуту.
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
