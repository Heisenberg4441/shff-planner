import type {
  AuthInfo,
  Block,
  Category,
  DayTemplate,
  DupMode,
  DupScope,
  Settings,
  ViewMode,
} from '../../../shared/src/types';
import type { BootstrapPayload } from '../api';

export interface BlockDialogState {
  mode: 'new' | 'edit';
  date: string;
  id: string | null;
  title: string;
  category: string;
  start: number;
  end: number;
  note: string;
}

export interface DupDialogState {
  date: string;
  blockId: string | null;
  scope: DupScope;
  mode: DupMode;
  weekdays: number[];
}

export interface ToastState {
  id: string;
  title: string;
  text: string;
  tone: '' | 'warn' | 'note' | 'danger';
  opId?: string | null;
}

export interface PlannerState {
  /** setup — первый запуск: доступ ещё не выбран. */
  phase: 'loading' | 'setup' | 'auth' | 'ready' | 'error';
  fatal: string | null;
  auth: AuthInfo | null;
  view: ViewMode;
  date: string;
  /** Блоки по датам. Ключ есть — день загружен, пустой массив — день пуст. */
  blocks: Record<string, Block[]>;
  settings: Settings;
  categories: Category[];
  templates: DayTemplate[];
  loaded: { from: string; to: string } | null;
  server: BootstrapPayload['server'] | null;
  /** Сколько запросов в полёте: из этого складывается индикатор в шапке. */
  pending: number;
  online: boolean;
  live: boolean;
  dialog: BlockDialogState | null;
  dup: DupDialogState | null;
  settingsOpen: boolean;
  toasts: ToastState[];
}

export type PlannerAction =
  | { type: 'boot'; payload: BootstrapPayload }
  | { type: 'auth-required' }
  | { type: 'setup-required' }
  | { type: 'auth-info'; value: AuthInfo }
  | { type: 'fatal'; message: string }
  | { type: 'view'; value: ViewMode }
  | { type: 'date'; value: string }
  | { type: 'blocks'; days: string[]; blocks: Block[]; loaded?: { from: string; to: string } }
  | { type: 'settings'; value: Settings }
  | { type: 'categories'; value: Category[] }
  | { type: 'templates'; value: DayTemplate[] }
  | { type: 'pending'; delta: number }
  | { type: 'online'; value: boolean }
  | { type: 'live'; value: boolean }
  | { type: 'dialog'; value: BlockDialogState | null }
  | { type: 'dialog-patch'; patch: Partial<BlockDialogState> }
  | { type: 'dup'; value: DupDialogState | null }
  | { type: 'dup-patch'; patch: Partial<DupDialogState> }
  | { type: 'settings-open'; value: boolean }
  | { type: 'toast'; value: ToastState }
  | { type: 'toast-dismiss'; id: string };
