import type { ReactNode } from 'react';

import { WEEKDAY_AWARE_SCOPES, duplicationTargets } from '../../../shared/src/dup';
import { pluralBlocks, pluralDays } from '../../../shared/src/plural';
import { plannedMinutes } from '../../../shared/src/stats';
import {
  MONTHS_NOM,
  WD_SHORT,
  humanDur,
  parseDateKey,
  shiftDateKey,
} from '../../../shared/src/time';
import type { DupScope } from '../../../shared/src/types';
import { cx } from '../lib/css';
import { usePlanner } from '../state/usePlanner';
import { Dialog } from './Dialog';

interface ScopeDef {
  id: DupScope;
  label: string;
  hint: (date: string) => string;
}

const SCOPES: ScopeDef[] = [
  { id: 'tomorrow', label: 'на завтра', hint: (date) => shiftDateKey(date, 1) },
  { id: 'restweek', label: 'до конца недели', hint: () => 'включая выходные' },
  { id: 'workweek', label: 'на будни этой недели', hint: () => 'пн–пт' },
  { id: 'week', label: 'на всю неделю', hint: () => 'пн–вс' },
  { id: 'month', label: 'на весь месяц', hint: (date) => MONTHS_NOM[parseDateKey(date).getMonth()] },
  { id: 'weekdays', label: 'на выбранные дни недели', hint: () => '4 недели вперёд' },
  { id: 'quarter', label: 'на квартал вперёд', hint: () => '90 дней' },
];

const MODES = [
  { id: 'replace' as const, label: 'заменить сутки целиком', sub: 'старая разметка дня удаляется' },
  { id: 'merge' as const, label: 'добавить поверх', sub: 'пересекающиеся блоки уступают место новым' },
];

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function DuplicateDialog(): ReactNode {
  const { state, actions, blocksOf } = usePlanner();
  const dup = state.dup;
  if (!dup) return null;

  const source = blocksOf(dup.date);
  const items = dup.blockId ? source.filter((block) => block.id === dup.blockId) : source;
  const targets = duplicationTargets(dup.date, dup.scope, dup.weekdays);
  const weekdayAware = WEEKDAY_AWARE_SCOPES.includes(dup.scope);
  const effectiveMode = dup.blockId ? 'merge' : dup.mode;

  return (
    <Dialog
      bar={`shff-plan copy --from ${dup.date}`}
      title={dup.blockId ? 'Дублировать блок' : 'Дублировать сутки'}
      lede={
        dup.blockId
          ? 'Один блок уедет в выбранные дни, остальная разметка не тронется.'
          : `Разметка ${dup.date} (${pluralBlocks(source.length)}, ${humanDur(plannedMinutes(source))}) станет шаблоном для выбранного диапазона.`
      }
      width={620}
      scroll
      onClose={actions.closeDup}
      footer={
        <>
          <button className="btn ghost sm" type="button" onClick={actions.closeDup}>
            [&nbsp;Отмена&nbsp;]
          </button>
          <button
            className="btn primary sm"
            type="button"
            onClick={actions.applyDup}
            disabled={!targets.length || !items.length}
          >
            [&nbsp;Продублировать →&nbsp;]
          </button>
        </>
      }
    >
      <div className="pl-list">
        {SCOPES.map((scope) => {
          const on = dup.scope === scope.id;
          const count = duplicationTargets(dup.date, scope.id, dup.weekdays).length;
          return (
            <button
              key={scope.id}
              type="button"
              className={cx('pl-radio', on && 'on')}
              onClick={() => actions.patchDup({ scope: scope.id })}
            >
              <span className="pl-radio-mark">{on ? '●' : '○'}</span>
              <span className="pl-radio-label">{scope.label}</span>
              <span className="pl-radio-note">
                {scope.hint(dup.date)} · {count} дн.
              </span>
            </button>
          );
        })}
      </div>

      <div className="pl-section">
        <span className="field-label pl-section-label">
          Только эти дни недели{' '}
          <span style={{ color: 'var(--faint)' }}>
            // для режимов «месяц», «дни недели» и «квартал»
          </span>
        </span>
        <div className="pl-chips">
          {WEEKDAY_ORDER.map((weekday) => (
            <button
              key={weekday}
              type="button"
              className={cx('chip', dup.weekdays.includes(weekday) && 'active')}
              style={{ minWidth: 40, opacity: weekdayAware ? 1 : 0.5 }}
              onClick={() => actions.toggleWeekday(weekday)}
            >
              {WD_SHORT[weekday]}
            </button>
          ))}
        </div>
      </div>

      {dup.blockId ? (
        <div className="pl-section pl-note">
          // блок кладётся поверх: то, что попадёт под него, уступит место
        </div>
      ) : (
        <div className="pl-section pl-stack">
          <span className="field-label">Что делать с тем, что уже стоит в этих днях</span>
          {MODES.map((mode) => {
            const on = dup.mode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                className={cx('pl-radio', 'stacked', on && 'on')}
                onClick={() => actions.patchDup({ mode: mode.id })}
              >
                <span className="pl-radio-mark">{on ? '●' : '○'}</span>
                <span style={{ textAlign: 'left' }}>
                  <span className="pl-radio-label">{mode.label}</span>
                  <span className="pl-radio-sub">{mode.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="pl-cmd">
        <span className="pl-cmd-line">
          $ shff-plan copy --from {dup.date} --to {dup.scope}{' '}
          {effectiveMode === 'replace' ? '--replace' : '--merge'}
        </span>
        <span className="pl-cmd-note">
          {targets.length
            ? `// затронет ${pluralDays(targets.length)} · перенесётся ${pluralBlocks(items.length)} в каждый · отменяемо`
            : '// в выбранном диапазоне нет дней — отметь дни недели или смени режим'}
        </span>
      </div>
    </Dialog>
  );
}
