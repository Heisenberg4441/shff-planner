/* ============================================================
   Клиент к своему же серверу. Один и тот же origin, поэтому ни
   базовых URL, ни CORS: только заголовок X-Client-Id, чтобы не
   реагировать на собственное эхо в потоке событий.
   ============================================================ */

import type {
  AuthInfo,
  AuthMode,
  Block,
  Category,
  DayTemplate,
  DuplicateRequest,
  ExportBundle,
  MutationResult,
  OpRef,
  Settings,
  ViewMode,
} from '../../shared/src/types';

export const CLIENT_ID =
  globalThis.crypto?.randomUUID?.() ?? 'c' + Math.random().toString(36).slice(2, 12);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get offline(): boolean {
    return this.status === 0;
  }
}

export interface BootstrapPayload {
  server: {
    version: string;
    time: string;
    revision: number;
    auth: AuthInfo;
    seed: string;
  };
  range: { from: string; to: string };
  settings: Settings;
  categories: Category[];
  templates: DayTemplate[];
  blocks: Block[];
  lastOp: OpRef | null;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        Accept: 'application/json',
        'X-Client-Id': CLIENT_ID,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'offline', 'Сервис не отвечает. Проверь, что контейнер жив.');
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const payload = (data ?? {}) as Record<string, unknown>;
    throw new ApiError(
      response.status,
      typeof payload.error === 'string' ? payload.error : 'http_' + response.status,
      typeof payload.message === 'string' ? payload.message : `Сервис ответил ${response.status}.`,
      payload,
    );
  }

  return (data ?? {}) as T;
}

export interface BlockInput {
  date: string;
  start: number;
  end: number;
  title: string;
  category: string;
  note: string;
  overlap?: 'trim' | 'reject';
}

export const api = {
  bootstrap(view: ViewMode, date: string): Promise<BootstrapPayload> {
    return request('GET', `/api/bootstrap?view=${view}&date=${date}`);
  },

  blocks(from: string, to: string): Promise<{ range: { from: string; to: string }; blocks: Block[] }> {
    return request('GET', `/api/blocks?from=${from}&to=${to}`);
  },

  createBlock(input: BlockInput): Promise<MutationResult> {
    return request('POST', '/api/blocks', input);
  },

  updateBlock(id: string, input: Partial<BlockInput>): Promise<MutationResult> {
    return request('PATCH', `/api/blocks/${id}`, input);
  },

  deleteBlock(id: string): Promise<MutationResult & { removed: Block }> {
    return request('DELETE', `/api/blocks/${id}`);
  },

  replaceDay(date: string, payload: { templateId: string } | { blocks: Array<Omit<BlockInput, 'date'>> }) {
    return request<MutationResult>('PUT', `/api/days/${date}`, payload);
  },

  duplicate(payload: DuplicateRequest): Promise<MutationResult & { targets: string[] }> {
    return request('POST', '/api/duplicate', payload);
  },

  undo(opId?: string | null): Promise<MutationResult & { undone: OpRef }> {
    return request('POST', '/api/undo', { opId: opId ?? null });
  },

  patchSettings(patch: Partial<Settings>): Promise<{ settings: Settings }> {
    return request('PATCH', '/api/settings', patch);
  },

  addCategory(input: { id: string; label: string; color: string }): Promise<{ category: Category }> {
    return request('POST', '/api/categories', input);
  },

  updateCategory(id: string, input: { label: string; color: string }): Promise<{ category: Category }> {
    return request('PATCH', `/api/categories/${id}`, input);
  },

  deleteCategory(id: string): Promise<{ deleted: string }> {
    return request('DELETE', `/api/categories/${id}`);
  },

  captureTemplate(input: { name: string; note: string; fromDate: string }): Promise<{ template: DayTemplate }> {
    return request('POST', '/api/templates', input);
  },

  deleteTemplate(id: string): Promise<{ deleted: string; op: OpRef }> {
    return request('DELETE', `/api/templates/${id}`);
  },

  /* ---------- доступ ---------- */

  authState(): Promise<{ auth: AuthInfo }> {
    return request('GET', '/api/auth');
  },

  setupAccount(login: string, password: string): Promise<{ auth: AuthInfo }> {
    return request('POST', '/api/auth/setup', { mode: 'account', login, password });
  },

  setupOpen(): Promise<{ auth: AuthInfo }> {
    return request('POST', '/api/auth/setup', { mode: 'open' });
  },

  login(login: string, password: string): Promise<{ auth: AuthInfo }> {
    return request('POST', '/api/auth/login', { login, password });
  },

  logout(): Promise<{ auth: AuthInfo }> {
    return request('POST', '/api/auth/logout');
  },

  updateAuth(patch: {
    mode: AuthMode;
    login?: string;
    password?: string;
    currentPassword?: string;
  }): Promise<{ auth: AuthInfo }> {
    return request('PATCH', '/api/auth', patch);
  },

  importBundle(bundle: unknown, mode: 'replace' | 'merge'): Promise<MutationResult> {
    return request('POST', '/api/import', { ...(bundle as object), mode });
  },

  exportBundle(): Promise<ExportBundle> {
    return request('GET', '/api/export');
  },
};
