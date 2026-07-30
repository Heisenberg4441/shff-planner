import { DEFAULT_SETTINGS } from '../../../shared/src/seed';
import { sortBlocks } from '../../../shared/src/overlap';
import { eachDate, todayKey } from '../../../shared/src/time';
import type { Block } from '../../../shared/src/types';
import type { PlannerAction, PlannerState } from './types';

export const MAX_TOASTS = 4;

export function initialState(): PlannerState {
  return {
    phase: 'loading',
    fatal: null,
    auth: null,
    view: 'day',
    date: todayKey(),
    blocks: {},
    settings: { ...DEFAULT_SETTINGS },
    categories: [],
    templates: [],
    loaded: null,
    server: null,
    pending: 0,
    online: true,
    live: false,
    dialog: null,
    dup: null,
    settingsOpen: false,
    toasts: [],
  };
}

/** Раскладывает плоский список блоков по дням, заполняя пустые дни пустыми массивами. */
function mergeDays(
  current: Record<string, Block[]>,
  days: string[],
  blocks: Block[],
): Record<string, Block[]> {
  if (!days.length) return current;
  const next = { ...current };
  const byDate = new Map<string, Block[]>();
  for (const block of blocks) {
    const list = byDate.get(block.date);
    if (list) list.push(block);
    else byDate.set(block.date, [block]);
  }
  for (const day of days) next[day] = sortBlocks(byDate.get(day) ?? []);
  return next;
}

export function reducer(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case 'boot': {
      const { payload } = action;
      return {
        ...state,
        phase: 'ready',
        fatal: null,
        online: true,
        auth: payload.server.auth,
        server: payload.server,
        settings: payload.settings,
        categories: payload.categories,
        templates: payload.templates,
        blocks: mergeDays(state.blocks, eachDate(payload.range), payload.blocks),
        loaded: payload.range,
      };
    }
    case 'auth-required':
      return { ...state, phase: 'auth', pending: 0 };
    case 'setup-required':
      return { ...state, phase: 'setup', pending: 0 };
    case 'auth-info':
      return { ...state, auth: action.value };
    case 'fatal':
      return { ...state, phase: 'error', fatal: action.message };
    case 'view':
      return { ...state, view: action.value };
    case 'date':
      return { ...state, date: action.value };
    case 'blocks':
      return {
        ...state,
        blocks: mergeDays(state.blocks, action.days, action.blocks),
        loaded: action.loaded ?? state.loaded,
      };
    case 'settings':
      return { ...state, settings: action.value };
    case 'categories':
      return { ...state, categories: action.value };
    case 'templates':
      return { ...state, templates: action.value };
    case 'pending':
      return { ...state, pending: Math.max(0, state.pending + action.delta) };
    case 'online':
      return { ...state, online: action.value };
    case 'live':
      return { ...state, live: action.value };
    case 'dialog':
      return { ...state, dialog: action.value };
    case 'dialog-patch':
      return state.dialog ? { ...state, dialog: { ...state.dialog, ...action.patch } } : state;
    case 'dup':
      return { ...state, dup: action.value };
    case 'dup-patch':
      return state.dup ? { ...state, dup: { ...state.dup, ...action.patch } } : state;
    case 'settings-open':
      return { ...state, settingsOpen: action.value };
    case 'toast':
      return { ...state, toasts: [...state.toasts, action.value].slice(-MAX_TOASTS) };
    case 'toast-dismiss':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    default:
      return state;
  }
}
