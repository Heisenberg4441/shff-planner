import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { pluralBlocks } from '../../../shared/src/plural';
import { pad } from '../../../shared/src/time';
import { CATEGORY_ID_RE } from '../../../shared/src/validate';
import { api } from '../api';
import { cx, vars } from '../lib/css';
import { CATEGORY_COLORS } from '../lib/themes';
import { usePlanner } from '../state/usePlanner';
import { AccessSettings } from './AccessSettings';
import { Dialog } from './Dialog';

/** Транслит для id категории: id живёт в API и в метриках, поэтому латиница. */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

function slugify(label: string): string {
  const latin = [...label.toLowerCase()]
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return CATEGORY_ID_RE.test(latin) ? latin : `cat-${Date.now().toString(36).slice(-4)}`;
}

export function SettingsDialog(): ReactNode {
  const { state, actions } = usePlanner();
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [newLabel, setNewLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const settings = state.settings;

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    await actions.importBundle(text, importMode);
  };

  const download = async () => {
    // ходим через тот же клиент, чтобы поймать 401 и показать вход, а не пустой файл
    const bundle = await api.exportBundle().catch(() => null);
    if (!bundle) {
      actions.toast('Бекап не собрался', 'Сервис не отдал данные. Посмотри логи контейнера.', 'warn');
      return;
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shff-planner-${bundle.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    actions.toast('Бекап скачан', `${pluralBlocks(bundle.blocks.length)} · ${bundle.categories.length} категорий`);
  };

  return (
    <Dialog
      bar="shff-plan config"
      title="Настройки"
      lede="Всё хранится в той же базе, что и разметка: перенесёшь том — перенесёшь и настройки."
      width={720}
      scroll
      onClose={() => actions.openSettings(false)}
      footer={
        <button className="btn primary sm" type="button" onClick={() => actions.openSettings(false)}>
          [&nbsp;Готово&nbsp;]
        </button>
      }
    >
      <div className="pl-settings-grid">
        <div>
          <div className="pl-panel-title">// СЕТКА</div>
          <div className="pl-fields">
            <div>
              <span className="field-label pl-section-label">Шаг ячейки</span>
              <div className="pl-chips">
                {([15, 30] as const).map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className={cx('chip', settings.slotMinutes === minutes && 'active')}
                    onClick={() => actions.patchSettings({ slotMinutes: minutes })}
                  >
                    {minutes} мин
                  </button>
                ))}
              </div>
            </div>

            <label className="field">
              <span className="field-label">
                Начало суток в сетке{' '}
                <span style={{ color: 'var(--faint)' }}>// что раньше — покажется само</span>
              </span>
              <span className="select-wrap">
                <select
                  className="select"
                  value={settings.dayStart}
                  onChange={(event) => actions.patchSettings({ dayStart: Number(event.target.value) })}
                >
                  {Array.from({ length: 11 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {pad(hour)}:00
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </div>

          <div className="pl-panel-title" style={{ marginTop: 22 }}>
            // ПАНЕЛИ
          </div>
          <div className="pl-stack">
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.showBalance}
                onChange={(event) => actions.patchSettings({ showBalance: event.target.checked })}
              />
              <span className="track" />
              <span>баланс категорий в сайдбаре</span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.crt}
                onChange={(event) => actions.patchSettings({ crt: event.target.checked })}
              />
              <span className="track" />
              <span>скан-линии и свечение (CRT)</span>
            </label>
          </div>

          <div className="pl-panel-title" style={{ marginTop: 22 }}>
            // СЕРВИС
          </div>
          <div className="pl-rows">
            <div className="pl-row">
              <span className="pl-row-key">версия</span>
              <span className="pl-row-val">{state.server?.version ?? '—'}</span>
            </div>
            <div className="pl-row">
              <span className="pl-row-key">живые обновления</span>
              <span className={cx('pl-row-val', state.live ? 'accent' : 'mute')}>
                {state.live ? 'подключены' : 'нет'}
              </span>
            </div>
          </div>
        </div>

        <div>
          <div className="pl-panel-title">// КАТЕГОРИИ</div>
          <div className="pl-cat-editor">
            {state.categories.map((category) => (
              <div key={category.id} className="pl-cat-line">
                <input
                  className="input"
                  defaultValue={category.label}
                  aria-label={`название категории ${category.id}`}
                  onBlur={(event) => {
                    const label = event.target.value.trim();
                    if (label && label !== category.label) {
                      actions.updateCategory(category.id, { label, color: category.color });
                    } else {
                      event.target.value = category.label;
                    }
                  }}
                />
                <span className="pl-color-pick">
                  {CATEGORY_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={cx('pl-color-dot', category.color === color && 'on')}
                      style={vars({ '--cat': color })}
                      aria-label={`цвет ${color}`}
                      title={color}
                      onClick={() => actions.updateCategory(category.id, { label: category.label, color })}
                    />
                  ))}
                </span>
                <button
                  className="pl-mini danger"
                  type="button"
                  onClick={() => actions.deleteCategory(category.id)}
                  title="удалить категорию (только если на ней нет блоков)"
                  aria-label={`удалить категорию ${category.label}`}
                >
                  ✕
                </button>
              </div>
            ))}

            <div className="pl-cat-line">
              <input
                className="input"
                placeholder="новая категория"
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  const label = newLabel.trim();
                  if (!label) return;
                  actions.addCategory({ id: slugify(label), label, color: CATEGORY_COLORS[5] });
                  setNewLabel('');
                }}
              />
              <button
                className="pl-mini"
                type="button"
                onClick={() => {
                  const label = newLabel.trim();
                  if (!label) return;
                  actions.addCategory({ id: slugify(label), label, color: CATEGORY_COLORS[5] });
                  setNewLabel('');
                }}
              >
                + добавить
              </button>
            </div>
          </div>

          <div className="pl-panel-title" style={{ marginTop: 22 }}>
            // ДАННЫЕ
          </div>
          <p className="pl-note" style={{ marginBottom: 10 }}>
            Бекап — это один JSON: блоки, категории, шаблоны, настройки. Им же переносят планировщик на
            другой сервер.
          </p>
          <div className="pl-chips" style={{ marginBottom: 12 }}>
            <button className="btn ghost sm" type="button" onClick={() => void download()}>
              [&nbsp;Скачать бекап&nbsp;]
            </button>
            <button className="btn ghost sm" type="button" onClick={() => fileRef.current?.click()}>
              [&nbsp;Загрузить бекап&nbsp;]
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                void pickFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
          <span className="field-label pl-section-label">Режим загрузки бекапа</span>
          <div className="pl-chips">
            {(
              [
                { id: 'replace' as const, label: 'заменить всё' },
                { id: 'merge' as const, label: 'добавить к текущему' },
              ]
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={cx('chip', importMode === mode.id && 'active')}
                onClick={() => setImportMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AccessSettings />
    </Dialog>
  );
}
