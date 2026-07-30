import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../../shared/src/seed';
import { dayRange, todayKey } from '../../shared/src/time';
import type { Block } from '../../shared/src/types';
import { App } from './App';

const TODAY = todayKey();

function block(id: string, start: number, end: number, title: string, category = 'deep'): Block {
  return { id, date: TODAY, start, end, title, category, note: '' };
}

const BLOCKS: Block[] = [
  block('b1', 8 * 60, 9 * 60 + 45, 'Deep: миграция на Nextcloud'),
  block('b2', 12 * 60, 12 * 60 + 40, 'Обед', 'body'),
];

interface Call {
  url: string;
  method: string;
  body: unknown;
}

const calls: Call[] = [];

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const OPEN_AUTH = {
  configured: true,
  mode: 'open' as const,
  login: null,
  source: 'db' as const,
  authenticated: true,
};

function bootstrapPayload(blocks: Block[] = BLOCKS) {
  return {
    server: {
      version: 'test',
      time: new Date().toISOString(),
      revision: 1,
      auth: OPEN_AUTH,
      seed: 'none',
    },
    range: dayRange(TODAY),
    settings: DEFAULT_SETTINGS,
    categories: DEFAULT_CATEGORIES,
    templates: [
      { id: 'work', name: 'Рабочий день', note: 'три окна', kind: 'builtin', sort: 0, rows: [] },
    ],
    blocks,
    lastOp: null,
  };
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, method, body });

      if (url.startsWith('/api/bootstrap')) return jsonResponse(bootstrapPayload());
      if (url.startsWith('/api/blocks') && method === 'GET') {
        return jsonResponse({ range: dayRange(TODAY), blocks: BLOCKS });
      }
      if (url === '/api/blocks' && method === 'POST') {
        const created = block('b3', body.start, body.end, body.title, body.category);
        return jsonResponse(
          { days: [TODAY], blocks: [...BLOCKS, created], op: { id: 'op1' }, revision: 2, partial: false },
          201,
        );
      }
      return jsonResponse({ error: 'not_found', message: 'нет такого' }, 404);
    }),
  );
});

describe('планировщик целиком', () => {
  it('поднимается, показывает сутки и разметку', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Планировщик дня' })).toBeTruthy();
    expect(await screen.findByText('Deep: миграция на Nextcloud')).toBeTruthy();
    expect(screen.getByText('Обед')).toBeTruthy();

    // окно терминала докладывает объём разметки
    expect(screen.getByText(`~/planner/${TODAY} — 2 блока, 2 ч 25 м`)).toBeTruthy();

    // сайдбар: сейчас, сутки, дыры, шаблоны
    expect(screen.getByText('// СЕЙЧАС')).toBeTruthy();
    expect(screen.getByText(`// СУТКИ ${TODAY}`)).toBeTruthy();
    expect(screen.getByText('// ДЫРЫ В РАЗМЕТКЕ')).toBeTruthy();
    expect(screen.getByText('Рабочий день')).toBeTruthy();
  });

  it('считает метрики суток, а не показывает заглушки', async () => {
    render(<App />);
    await screen.findByText('Обед');

    const stats = screen.getByText(`// СУТКИ ${TODAY}`).parentElement!;
    const metric = (key: string) => within(stats).getByText(key).parentElement!;

    expect(within(metric('разметка')).getByText('2 ч 25 м / 24 ч')).toBeTruthy();
    expect(within(metric('блоков')).getByText('2')).toBeTruthy();
    expect(within(metric('deep всего')).getByText('1 ч 45 м')).toBeTruthy();
    // 06:00 — начало сетки; дыры: 06:00–08:00, 09:45–12:00, 12:40–24:00
    expect(within(metric('не размечено')).getByText('15 ч 35 м')).toBeTruthy();
    expect(within(metric('переключений')).getByText('1')).toBeTruthy();
  });

  it('клик по пустой ячейке открывает диалог с этим временем', async () => {
    render(<App />);
    await screen.findByText('Обед');

    fireEvent.click(screen.getByTitle('поставить блок с 07:00'));

    expect(await screen.findByText('Новый блок в сутках')).toBeTruthy();
    expect(screen.getByLabelText('Начало, часы и минуты')).toHaveProperty('value', '07:00');
    expect(screen.getByLabelText('Конец, часы и минуты')).toHaveProperty('value', '07:30');
  });

  it('сохраняет новый блок на сервер и показывает тост', async () => {
    render(<App />);
    await screen.findByText('Обед');

    fireEvent.click(screen.getByTitle('поставить блок с 07:00'));
    await screen.findByText('Новый блок в сутках');

    fireEvent.change(screen.getByPlaceholderText('напр. deep: миграция на Nextcloud'), {
      target: { value: 'Зарядка' },
    });
    fireEvent.click(screen.getByText(/Сохранить/));

    await waitFor(() => {
      const post = calls.find((call) => call.url === '/api/blocks' && call.method === 'POST');
      expect(post).toBeTruthy();
      expect(post!.body).toMatchObject({
        date: TODAY,
        start: 420,
        end: 450,
        title: 'Зарядка',
        category: 'deep',
      });
    });

    expect(await screen.findByText('Блок поставлен')).toBeTruthy();
  });

  it('предупреждает о пересечении и обещает подрезку, а не удаление', async () => {
    render(<App />);
    await screen.findByText('Обед');

    // 08:00 занято, поэтому идём через правку существующего блока и растягиваем его на обед
    fireEvent.click(screen.getByTitle('поставить блок с 11:00'));
    await screen.findByText('Новый блок в сутках');
    fireEvent.click(screen.getByText('120 мин'));

    expect(await screen.findByText('ВНИМАНИЕ')).toBeTruthy();
    expect(screen.getByText(/Обед \(12:00–12:40\) — снимется целиком/)).toBeTruthy();
  });

  it('диалог раскатки считает дни-приёмники', async () => {
    render(<App />);
    await screen.findByText('Обед');

    fireEvent.click(screen.getByText(/Дублировать день/));

    expect(await screen.findByText('Дублировать сутки')).toBeTruthy();
    expect(screen.getByText('на всю неделю')).toBeTruthy();
    expect(screen.getByText(/затронет 6 дней · перенесётся 2 блока в каждый · отменяемо/)).toBeTruthy();
  });

  it('честно предупреждает, что выходные пропустит, и умеет включить все дни', async () => {
    render(<App />);
    await screen.findByText('Обед');

    fireEvent.click(screen.getByText(/Дублировать день/));
    await screen.findByText('Дублировать сутки');

    // «на всю неделю» фильтр не применяет — и не показывает мёртвых кнопок
    expect(screen.queryByText('В какие дни недели раскатывать')).toBeNull();

    fireEvent.click(screen.getByText('на квартал вперёд'));

    expect(await screen.findByText('В какие дни недели раскатывать')).toBeTruthy();
    // предупреждение стоит дважды: под галочками и в строке перед кнопкой
    expect(screen.getAllByText(/сб, вс пропустим/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/затронет .* \(сб, вс пропустим\)/)).toBeTruthy();

    fireEvent.click(screen.getByText('все дни'));

    expect(await screen.findByText(/заполним каждый день диапазона/)).toBeTruthy();
    expect(screen.queryByText(/пропустим/)).toBeNull();
  });

  it('переключает вид по горячим клавишам', async () => {
    render(<App />);
    await screen.findByText('Обед');

    fireEvent.keyDown(window, { key: 'm' });
    expect(await screen.findByText('// цветная полоса — плотность суток по категориям')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'w' });
    expect(
      await screen.findByText('// клик по колонке — открыть день, клик по часу — новый блок'),
    ).toBeTruthy();
  });
});

describe('первый запуск', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ url, method, body });

        if (url.startsWith('/api/bootstrap')) {
          return jsonResponse(
            { error: 'setup_required', message: 'Планировщик ещё не настроен.' },
            401,
          );
        }
        if (url === '/api/auth' && method === 'GET') {
          return jsonResponse({
            auth: { configured: false, mode: 'open', login: null, source: 'none', authenticated: false },
          });
        }
        if (url === '/api/auth/setup' && method === 'POST') {
          return jsonResponse({ auth: { ...OPEN_AUTH, mode: body.mode, login: body.login ?? null } }, 201);
        }
        return jsonResponse({ error: 'not_found', message: 'нет такого' }, 404);
      }),
    );
  });

  it('вместо планировщика показывает мастер настройки доступа', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Кто здесь хозяин' })).toBeTruthy();
    expect(screen.getByText(/Создать администратора/)).toBeTruthy();
    expect(screen.getByText(/Использовать без пароля/)).toBeTruthy();
  });

  it('не отправляет короткий пароль на сервер и объясняет причину', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Кто здесь хозяин' });

    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'korotko' } });
    fireEvent.change(screen.getByLabelText('Ещё раз'), { target: { value: 'korotko' } });
    fireEvent.click(screen.getByText(/Создать администратора/));

    expect(await screen.findByText('НЕ ВЫШЛО')).toBeTruthy();
    expect(screen.getByText(/Пароль короче 8 знаков/)).toBeTruthy();
    expect(calls.some((call) => call.url === '/api/auth/setup')).toBe(false);
  });

  it('ловит несовпадение паролей', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Кто здесь хозяин' });

    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'freedom-at-home' } });
    fireEvent.change(screen.getByLabelText('Ещё раз'), { target: { value: 'freedom-at-hom' } });
    fireEvent.click(screen.getByText(/Создать администратора/));

    expect(await screen.findByText('Пароли не совпали.')).toBeTruthy();
  });

  it('регистрирует администратора', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Кто здесь хозяин' });

    fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'михаил' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'freedom-at-home' } });
    fireEvent.change(screen.getByLabelText('Ещё раз'), { target: { value: 'freedom-at-home' } });
    fireEvent.click(screen.getByText(/Создать администратора/));

    await waitFor(() => {
      const setup = calls.find((call) => call.url === '/api/auth/setup');
      expect(setup?.body).toEqual({ mode: 'account', login: 'михаил', password: 'freedom-at-home' });
    });
  });

  it('«без пароля» просит подтверждения и только потом уходит на сервер', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Кто здесь хозяин' });

    fireEvent.click(screen.getByText(/Использовать без пароля/));
    expect(await screen.findByText(/Да, без пароля/)).toBeTruthy();
    expect(calls.some((call) => call.url === '/api/auth/setup')).toBe(false);

    fireEvent.click(screen.getByText(/Да, без пароля/));
    await waitFor(() => {
      const setup = calls.find((call) => call.url === '/api/auth/setup');
      expect(setup?.body).toEqual({ mode: 'open' });
    });
  });
});
