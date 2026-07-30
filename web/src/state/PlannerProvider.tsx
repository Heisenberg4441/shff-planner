/* ============================================================
   Единственное место, где живёт состояние и разговор с сервером.
   Компоненты получают готовые данные и вызывают действия — они
   ничего не знают ни про fetch, ни про порядок обновлений.
   ============================================================ */

import { createContext, useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';

import { normalizeWeekdays } from '../../../shared/src/dup';
import { pluralDays } from '../../../shared/src/plural';
import { eachDate, fmtTime, rangeForView, shiftDateKey, todayKey } from '../../../shared/src/time';
import { DAY_MINUTES } from '../../../shared/src/types';
import type {
  Block,
  Category,
  DayTemplate,
  DupMode,
  DupScope,
  MutationResult,
  Settings,
  ThemeId,
  ViewMode,
} from '../../../shared/src/types';
import { ApiError, CLIENT_ID, api } from '../api';
import { initialState, reducer } from './reducer';
import type { BlockDialogState, DupDialogState, PlannerState } from './types';
import { useNow } from './useNow';

export interface PlannerActions {
  setView: (view: ViewMode) => void;
  setDate: (date: string) => void;
  openDay: (date: string) => void;
  shift: (steps: number) => void;
  goToday: () => void;

  openNew: (date: string, start: number, end?: number) => void;
  openEdit: (date: string, block: Block) => void;
  patchDialog: (patch: Partial<BlockDialogState>) => void;
  closeDialog: () => void;
  saveDialog: () => void;
  deleteFromDialog: () => void;
  removeBlock: (block: Block) => void;

  openDup: (scope: DupScope, blockId: string | null, date?: string) => void;
  patchDup: (patch: Partial<DupDialogState>) => void;
  toggleWeekday: (day: number) => void;
  applyDup: () => void;
  closeDup: () => void;

  applyTemplate: (template: DayTemplate) => void;
  captureTemplate: (name: string) => void;
  deleteTemplate: (template: DayTemplate) => void;

  patchSettings: (patch: Partial<Settings>) => void;
  setTheme: (theme: ThemeId) => void;
  addCategory: (input: { id: string; label: string; color: string }) => void;
  updateCategory: (id: string, input: { label: string; color: string }) => void;
  deleteCategory: (id: string) => void;

  undo: (opId?: string | null) => void;
  refresh: () => void;
  openSettings: (open: boolean) => void;
  toast: (title: string, text: string, tone?: '' | 'warn' | 'note' | 'danger', opId?: string | null) => void;
  dismissToast: (id: string) => void;

  login: (login: string, password: string) => Promise<boolean>;
  logout: () => void;
  setupAccount: (login: string, password: string) => Promise<boolean>;
  setupOpen: () => Promise<boolean>;
  updateAuth: (patch: {
    mode: 'open' | 'account';
    login?: string;
    password?: string;
    currentPassword?: string;
  }) => Promise<boolean>;
  importBundle: (raw: string, mode: 'replace' | 'merge') => Promise<void>;
}

export interface PlannerContextValue {
  state: PlannerState;
  now: Date;
  range: { from: string; to: string };
  actions: PlannerActions;
  blocksOf: (date: string) => Block[];
  categoryOf: (id: string) => Category;
  isLoaded: (date: string) => boolean;
}

export const PlannerContext = createContext<PlannerContextValue | null>(null);

const FALLBACK_CATEGORY: Category = { id: 'deep', label: 'без категории', color: 'var(--accent)', sort: 0 };
const TOAST_TTL_MS = 6000;
const EMPTY: Block[] = [];

let toastSeq = 0;

export function PlannerProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const now = useNow();

  const range = useMemo(() => rangeForView(state.view, state.date), [state.view, state.date]);

  const stateRef = useRef(state);
  const rangeRef = useRef(range);
  useEffect(() => {
    stateRef.current = state;
    rangeRef.current = range;
  }, [state, range]);

  /* ---------- вспомогательное ---------- */

  const toast = useCallback(
    (title: string, text: string, tone: '' | 'warn' | 'note' | 'danger' = '', opId: string | null = null) => {
      const id = `t${++toastSeq}`;
      dispatch({ type: 'toast', value: { id, title, text, tone, opId } });
      window.setTimeout(() => dispatch({ type: 'toast-dismiss', id }), TOAST_TTL_MS);
    },
    [],
  );

  const fail = useCallback(
    (error: unknown, options: { authAsError?: boolean } = {}) => {
      if (error instanceof ApiError) {
        if (error.status === 401 && !options.authAsError) {
          // сессия кончилась: молча уводим на нужный экран.
          // до первой настройки данных нет ни у кого — там ждёт мастер, а не вход
          dispatch({ type: error.code === 'setup_required' ? 'setup-required' : 'auth-required' });
          return;
        }
        if (error.offline) {
          dispatch({ type: 'online', value: false });
          toast('Нет связи', error.message, 'danger');
          return;
        }
        toast('Не вышло', error.message, error.status >= 500 ? 'danger' : 'warn');
        return;
      }
      toast('Сбой в интерфейсе', String(error), 'danger');
    },
    [toast],
  );

  /**
   * Любой запрос: считает индикатор в шапке и приводит ошибки к тостам.
   * authAsError — для форм входа и смены пароля: там 401 это не «сессия
   * кончилась», а «не подошло», и человек должен это увидеть.
   */
  const run = useCallback(
    async <T,>(work: () => Promise<T>, options: { authAsError?: boolean } = {}): Promise<T | null> => {
      dispatch({ type: 'pending', delta: 1 });
      try {
        const result = await work();
        if (!stateRef.current.online) dispatch({ type: 'online', value: true });
        return result;
      } catch (error) {
        fail(error, options);
        return null;
      } finally {
        dispatch({ type: 'pending', delta: -1 });
      }
    },
    [fail],
  );

  const reloadRange = useCallback(async () => {
    const current = rangeRef.current;
    const payload = await run(() => api.blocks(current.from, current.to));
    if (payload) {
      dispatch({
        type: 'blocks',
        days: eachDate(payload.range),
        blocks: payload.blocks,
        loaded: payload.range,
      });
    }
  }, [run]);

  const refresh = useCallback(async () => {
    const { view, date } = stateRef.current;
    const payload = await run(() => api.bootstrap(view, date));
    if (payload) {
      dispatch({ type: 'boot', payload });
      return;
    }
    // не пустили: подтянем состояние доступа, чтобы показать нужный экран
    const gate = await api.authState().catch(() => null);
    if (gate) dispatch({ type: 'auth-info', value: gate.auth });
  }, [run]);

  /** Ответ мутации сразу кладём в состояние; если он «частичный» — перечитываем видимое. */
  const applyMutation = useCallback(
    (result: MutationResult) => {
      if (result.partial) {
        void reloadRange();
        return;
      }
      dispatch({ type: 'blocks', days: result.days, blocks: result.blocks });
    },
    [reloadRange],
  );

  /* ---------- навигация ---------- */

  const setView = useCallback((view: ViewMode) => dispatch({ type: 'view', value: view }), []);
  const setDate = useCallback((date: string) => dispatch({ type: 'date', value: date }), []);
  const openDay = useCallback((date: string) => {
    dispatch({ type: 'date', value: date });
    dispatch({ type: 'view', value: 'day' });
  }, []);
  const goToday = useCallback(() => dispatch({ type: 'date', value: todayKey() }), []);

  const shift = useCallback((steps: number) => {
    const { view, date } = stateRef.current;
    if (view === 'day') return dispatch({ type: 'date', value: shiftDateKey(date, steps) });
    if (view === 'week') return dispatch({ type: 'date', value: shiftDateKey(date, 7 * steps) });
    const [year, month] = date.split('-').map(Number);
    const moved = new Date(year, month - 1 + steps, 1);
    dispatch({
      type: 'date',
      value: `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}-01`,
    });
  }, []);

  /* ---------- диалог блока ---------- */

  const openNew = useCallback((date: string, start: number, end?: number) => {
    const { settings, categories } = stateRef.current;
    const step = settings.slotMinutes;
    dispatch({
      type: 'dialog',
      value: {
        mode: 'new',
        date,
        id: null,
        title: '',
        category: categories[0]?.id ?? FALLBACK_CATEGORY.id,
        start,
        end: end ?? Math.min(DAY_MINUTES, start + Math.max(30, step)),
        note: '',
      },
    });
  }, []);

  const openEdit = useCallback((date: string, block: Block) => {
    dispatch({
      type: 'dialog',
      value: {
        mode: 'edit',
        date,
        id: block.id,
        title: block.title,
        category: block.category,
        start: block.start,
        end: block.end,
        note: block.note,
      },
    });
  }, []);

  const patchDialog = useCallback(
    (patch: Partial<BlockDialogState>) => dispatch({ type: 'dialog-patch', patch }),
    [],
  );
  const closeDialog = useCallback(() => dispatch({ type: 'dialog', value: null }), []);

  const saveDialog = useCallback(() => {
    const dialog = stateRef.current.dialog;
    if (!dialog) return;
    if (dialog.end <= dialog.start) {
      toast('Не сохранено', 'Конец блока должен быть позже начала.', 'warn');
      return;
    }
    const title = dialog.title.trim() || 'Без названия';
    const input = {
      date: dialog.date,
      start: dialog.start,
      end: dialog.end,
      title,
      category: dialog.category,
      note: dialog.note,
    };
    void run(() => (dialog.id ? api.updateBlock(dialog.id, input) : api.createBlock(input))).then(
      (result) => {
        if (!result) return;
        applyMutation(result);
        dispatch({ type: 'dialog', value: null });
        toast(
          dialog.id ? 'Блок обновлён' : 'Блок поставлен',
          `${title} · ${fmtTime(dialog.start)}–${fmtTime(dialog.end)} · ${dialog.date}`,
          '',
          result.op?.id ?? null,
        );
      },
    );
  }, [applyMutation, run, toast]);

  const deleteFromDialog = useCallback(() => {
    const dialog = stateRef.current.dialog;
    if (!dialog?.id) return;
    void run(() => api.deleteBlock(dialog.id!)).then((result) => {
      if (!result) return;
      applyMutation(result);
      dispatch({ type: 'dialog', value: null });
      toast(
        'Блок снят',
        `${fmtTime(dialog.start)}–${fmtTime(dialog.end)} освободилось`,
        'note',
        result.op?.id ?? null,
      );
    });
  }, [applyMutation, run, toast]);

  const removeBlock = useCallback(
    (block: Block) => {
      void run(() => api.deleteBlock(block.id)).then((result) => {
        if (!result) return;
        applyMutation(result);
        toast('Блок снят', block.title, 'note', result.op?.id ?? null);
      });
    },
    [applyMutation, run, toast],
  );

  /* ---------- диалог раскатки ---------- */

  const openDup = useCallback((scope: DupScope, blockId: string | null, date?: string) => {
    dispatch({
      type: 'dup',
      value: {
        date: date ?? stateRef.current.date,
        blockId,
        scope,
        mode: blockId ? 'merge' : 'replace',
        weekdays: [1, 2, 3, 4, 5],
      },
    });
    if (blockId) dispatch({ type: 'dialog', value: null });
  }, []);

  const patchDup = useCallback((patch: Partial<DupDialogState>) => dispatch({ type: 'dup-patch', patch }), []);
  const closeDup = useCallback(() => dispatch({ type: 'dup', value: null }), []);

  const toggleWeekday = useCallback((day: number) => {
    const dup = stateRef.current.dup;
    if (!dup) return;
    const next = dup.weekdays.includes(day)
      ? dup.weekdays.filter((d) => d !== day)
      : normalizeWeekdays([...dup.weekdays, day]);
    dispatch({ type: 'dup-patch', patch: { weekdays: next } });
  }, []);

  const applyDup = useCallback(() => {
    const dup = stateRef.current.dup;
    if (!dup) return;
    void run(() =>
      api.duplicate({
        sourceDate: dup.date,
        blockIds: dup.blockId ? [dup.blockId] : null,
        scope: dup.scope,
        weekdays: dup.weekdays,
        mode: dup.mode,
      }),
    ).then((result) => {
      if (!result) return;
      applyMutation(result);
      dispatch({ type: 'dup', value: null });
      const what = dup.blockId ? 'Блок' : `День ${dup.date}`;
      const mode: DupMode | 'merge' = dup.blockId ? 'merge' : dup.mode;
      toast(
        `${what} продублирован`,
        `затронуто ${pluralDays(result.targets.length)} · режим: ${mode === 'replace' ? 'замена' : 'добавление'}`,
        '',
        result.op?.id ?? null,
      );
    });
  }, [applyMutation, run, toast]);

  /* ---------- шаблоны ---------- */

  const applyTemplate = useCallback(
    (template: DayTemplate) => {
      const date = stateRef.current.date;
      void run(() => api.replaceDay(date, { templateId: template.id })).then((result) => {
        if (!result) return;
        applyMutation(result);
        toast('Шаблон применён', `${template.name} → ${date}`, '', result.op?.id ?? null);
      });
    },
    [applyMutation, run, toast],
  );

  const captureTemplate = useCallback(
    (name: string) => {
      const { date, blocks } = stateRef.current;
      const count = (blocks[date] ?? EMPTY).length;
      if (!count) {
        toast('Нечего снимать', 'В этих сутках нет ни одного блока.', 'warn');
        return;
      }
      void run(() => api.captureTemplate({ name, note: `снято с ${date}`, fromDate: date })).then(
        (result) => {
          if (!result) return;
          dispatch({ type: 'templates', value: [...stateRef.current.templates, result.template] });
          toast('Шаблон снят', `${result.template.name} · ${date}`);
        },
      );
    },
    [run, toast],
  );

  const deleteTemplate = useCallback(
    (template: DayTemplate) => {
      void run(() => api.deleteTemplate(template.id)).then((result) => {
        if (!result) return;
        dispatch({
          type: 'templates',
          value: stateRef.current.templates.filter((t) => t.id !== template.id),
        });
        toast('Шаблон удалён', template.name, 'note', result.op?.id ?? null);
      });
    },
    [run, toast],
  );

  /* ---------- настройки и категории ---------- */

  const patchSettings = useCallback(
    (patch: Partial<Settings>) => {
      const previous = stateRef.current.settings;
      dispatch({ type: 'settings', value: { ...previous, ...patch } });
      void run(() => api.patchSettings(patch)).then((result) => {
        if (!result) {
          dispatch({ type: 'settings', value: previous });
          return;
        }
        dispatch({ type: 'settings', value: result.settings });
      });
    },
    [run],
  );

  const setTheme = useCallback((theme: ThemeId) => patchSettings({ theme }), [patchSettings]);

  const addCategory = useCallback(
    (input: { id: string; label: string; color: string }) => {
      void run(() => api.addCategory(input)).then((result) => {
        if (!result) return;
        dispatch({ type: 'categories', value: [...stateRef.current.categories, result.category] });
        toast('Категория добавлена', result.category.label);
      });
    },
    [run, toast],
  );

  const updateCategory = useCallback(
    (id: string, input: { label: string; color: string }) => {
      void run(() => api.updateCategory(id, input)).then((result) => {
        if (!result) return;
        dispatch({
          type: 'categories',
          value: stateRef.current.categories.map((c) => (c.id === id ? result.category : c)),
        });
      });
    },
    [run],
  );

  const deleteCategory = useCallback(
    (id: string) => {
      void run(() => api.deleteCategory(id)).then((result) => {
        if (!result) return;
        dispatch({
          type: 'categories',
          value: stateRef.current.categories.filter((c) => c.id !== id),
        });
        toast('Категория удалена', id, 'note');
      });
    },
    [run, toast],
  );

  /* ---------- отмена, вход, бекап ---------- */

  const undo = useCallback(
    (opId?: string | null) => {
      void run(() => api.undo(opId ?? null)).then((result) => {
        if (!result) return;
        applyMutation(result);
        void refresh();
        toast('Отменено', result.undone.summary, 'note');
      });
    },
    [applyMutation, refresh, run, toast],
  );

  const login = useCallback(
    async (userLogin: string, password: string): Promise<boolean> => {
      const result = await run(() => api.login(userLogin, password), { authAsError: true });
      if (!result) return false;
      await refresh();
      return true;
    },
    [refresh, run],
  );

  const logout = useCallback(() => {
    void run(() => api.logout()).then((result) => {
      if (!result) return;
      dispatch({ type: 'auth-info', value: result.auth });
      dispatch({ type: 'auth-required' });
    });
  }, [run]);

  const setupAccount = useCallback(
    async (userLogin: string, password: string): Promise<boolean> => {
      const result = await run(() => api.setupAccount(userLogin, password), { authAsError: true });
      if (!result) return false;
      dispatch({ type: 'auth-info', value: result.auth });
      await refresh();
      toast('Администратор заведён', `вход по логину ${userLogin}`);
      return true;
    },
    [refresh, run, toast],
  );

  const setupOpen = useCallback(async (): Promise<boolean> => {
    const result = await run(() => api.setupOpen(), { authAsError: true });
    if (!result) return false;
    dispatch({ type: 'auth-info', value: result.auth });
    await refresh();
    toast('Вход свободный', 'Пароль можно поставить позже — в настройках, раздел «доступ».', 'warn');
    return true;
  }, [refresh, run, toast]);

  const updateAuth = useCallback(
    async (patch: {
      mode: 'open' | 'account';
      login?: string;
      password?: string;
      currentPassword?: string;
    }): Promise<boolean> => {
      const result = await run(() => api.updateAuth(patch), { authAsError: true });
      if (!result) return false;
      dispatch({ type: 'auth-info', value: result.auth });
      toast(
        patch.mode === 'open' ? 'Пароль снят' : 'Доступ обновлён',
        patch.mode === 'open'
          ? 'Вход стал свободным: планировщик открыт всем, кто дотянется до порта.'
          : `вход по логину ${result.auth.login ?? patch.login ?? ''}`,
        patch.mode === 'open' ? 'warn' : '',
      );
      return true;
    },
    [run, toast],
  );

  const importBundle = useCallback(
    async (raw: string, mode: 'replace' | 'merge') => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        toast('Файл не читается', 'Это не JSON. Нужен файл, скачанный из этого же планировщика.', 'warn');
        return;
      }
      const result = await run(() => api.importBundle(parsed, mode));
      if (!result) return;
      await refresh();
      toast('Бекап загружен', `режим: ${mode === 'replace' ? 'замена' : 'добавление'}`, '', result.op?.id ?? null);
    },
    [refresh, run, toast],
  );

  const openSettings = useCallback((open: boolean) => dispatch({ type: 'settings-open', value: open }), []);
  const dismissToast = useCallback((id: string) => dispatch({ type: 'toast-dismiss', id }), []);

  /* ---------- эффекты ---------- */

  // первая загрузка
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // смена вида или даты — подтягиваем нужный диапазон
  useEffect(() => {
    if (state.phase !== 'ready') return;
    if (state.loaded && state.loaded.from === range.from && state.loaded.to === range.to) return;
    void reloadRange();
  }, [range, reloadRange, state.loaded, state.phase]);

  // тема и CRT-слой живут на <html>, чтобы блик и скан-линии тоже подчинялись
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = state.settings.theme;
    root.dataset.crt = state.settings.crt ? 'on' : 'off';
  }, [state.settings.theme, state.settings.crt]);

  // живые обновления с сервера: второй браузер, телефон, cron — всё видно сразу
  useEffect(() => {
    if (state.phase !== 'ready') return undefined;
    const source = new EventSource('/api/events');

    const onHello = () => dispatch({ type: 'live', value: true });
    const onChange = (event: MessageEvent<string>) => {
      dispatch({ type: 'live', value: true });
      let payload: { kind?: string; origin?: string | null } = {};
      try {
        payload = JSON.parse(event.data) as typeof payload;
      } catch {
        return;
      }
      if (payload.origin === CLIENT_ID) return;
      if (payload.kind === 'blocks') void reloadRange();
      else void refresh();
    };

    source.addEventListener('hello', onHello);
    source.addEventListener('change', onChange as EventListener);
    source.addEventListener('open', onHello);
    source.onerror = () => dispatch({ type: 'live', value: false });

    return () => {
      source.removeEventListener('hello', onHello);
      source.removeEventListener('change', onChange as EventListener);
      source.removeEventListener('open', onHello);
      source.close();
      dispatch({ type: 'live', value: false });
    };
  }, [refresh, reloadRange, state.phase]);

  // горячие клавиши
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const current = stateRef.current;
      const dialogOpen = !!current.dialog || !!current.dup || current.settingsOpen;

      // Escape работает всегда, в том числе из поля ввода: иначе диалог
      // не закрыть, не убрав сначала руки с клавиатуры
      if (key === 'escape') {
        if (!dialogOpen) return;
        dispatch({ type: 'dialog', value: null });
        dispatch({ type: 'dup', value: null });
        dispatch({ type: 'settings-open', value: false });
        event.preventDefault();
        return;
      }

      // остальные буквы — только вне полей ввода
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (dialogOpen || current.phase !== 'ready') return;

      if (key === 'd') setView('day');
      else if (key === 'w') setView('week');
      else if (key === 'm') setView('month');
      else if (key === 'n') openNew(current.date, 9 * 60);
      else if (key === 'c') openDup('week', null);
      else if (key === 't') goToday();
      else if (event.key === 'ArrowLeft') shift(-1);
      else if (event.key === 'ArrowRight') shift(1);
      else return;
      event.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goToday, openDup, openNew, setView, shift]);

  /* ---------- значение контекста ---------- */

  const categoryIndex = useMemo(() => {
    const map = new Map<string, Category>();
    for (const category of state.categories) map.set(category.id, category);
    return map;
  }, [state.categories]);

  const value = useMemo<PlannerContextValue>(() => {
    const actions: PlannerActions = {
      setView,
      setDate,
      openDay,
      shift,
      goToday,
      openNew,
      openEdit,
      patchDialog,
      closeDialog,
      saveDialog,
      deleteFromDialog,
      removeBlock,
      openDup,
      patchDup,
      toggleWeekday,
      applyDup,
      closeDup,
      applyTemplate,
      captureTemplate,
      deleteTemplate,
      patchSettings,
      setTheme,
      addCategory,
      updateCategory,
      deleteCategory,
      undo,
      refresh: () => void refresh(),
      openSettings,
      toast,
      dismissToast,
      login,
      logout,
      setupAccount,
      setupOpen,
      updateAuth,
      importBundle,
    };

    return {
      state,
      now,
      range,
      actions,
      blocksOf: (date: string) => state.blocks[date] ?? EMPTY,
      categoryOf: (id: string) =>
        categoryIndex.get(id) ?? state.categories[0] ?? { ...FALLBACK_CATEGORY, id },
      isLoaded: (date: string) => Object.prototype.hasOwnProperty.call(state.blocks, date),
    };
  }, [
    addCategory,
    applyDup,
    applyTemplate,
    captureTemplate,
    categoryIndex,
    closeDialog,
    closeDup,
    deleteCategory,
    deleteFromDialog,
    deleteTemplate,
    dismissToast,
    goToday,
    importBundle,
    login,
    logout,
    now,
    openDay,
    openDup,
    openEdit,
    openNew,
    openSettings,
    patchDialog,
    patchDup,
    patchSettings,
    range,
    refresh,
    removeBlock,
    saveDialog,
    setDate,
    setTheme,
    setView,
    setupAccount,
    setupOpen,
    shift,
    state,
    toast,
    toggleWeekday,
    undo,
    updateAuth,
    updateCategory,
  ]);

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}
