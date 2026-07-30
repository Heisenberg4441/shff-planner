import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Block, DayTemplate } from '../../shared/src/types';
import type { BuiltApp } from '../src/app';
import { DAY, makeApp, minutes } from './helpers';

let built: BuiltApp;

beforeEach(async () => {
  built = await makeApp();
});

afterEach(async () => {
  await built.app.close();
});

async function createBlock(patch: Partial<Block> & { start: number; end: number }) {
  const response = await built.app.inject({
    method: 'POST',
    url: '/api/blocks',
    payload: {
      date: DAY,
      title: 'Deep: миграция',
      category: 'deep',
      note: '',
      ...patch,
    },
  });
  return response;
}

async function dayBlocks(date = DAY): Promise<Block[]> {
  const response = await built.app.inject({ method: 'GET', url: `/api/days/${date}` });
  return response.json<{ blocks: Block[] }>().blocks;
}

describe('здоровье и загрузка', () => {
  it('health отвечает без входа и знает про базу', async () => {
    const response = await built.app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', auth: 'open', db: { blocks: 0 } });
  });

  it('bootstrap отдаёт настройки, категории и встроенные шаблоны', async () => {
    const response = await built.app.inject({
      method: 'GET',
      url: `/api/bootstrap?view=day&date=${DAY}`,
    });
    const body = response.json<{
      server: { auth: { configured: boolean; mode: string } };
      settings: { slotMinutes: number; dayStart: number };
      categories: Array<{ id: string }>;
      templates: DayTemplate[];
      range: { from: string; to: string };
    }>();
    expect(body.server.auth).toMatchObject({ configured: true, mode: 'open', authenticated: true });
    expect(body.settings).toMatchObject({ slotMinutes: 15, dayStart: 6, crt: true });
    expect(body.categories.map((c) => c.id)).toEqual(['deep', 'ops', 'body', 'rest']);
    expect(body.templates.map((t) => t.id)).toEqual(['work', 'focus', 'off', 'clear']);
    expect(body.range).toEqual({ from: DAY, to: DAY });
  });

  it('диапазон недели считается по виду', async () => {
    const response = await built.app.inject({
      method: 'GET',
      url: `/api/blocks?view=week&date=${DAY}`,
    });
    expect(response.json<{ range: unknown }>().range).toEqual({
      from: '2026-07-27',
      to: '2026-08-02',
    });
  });
});

describe('блоки', () => {
  it('ставит блок и возвращает его в сутках', async () => {
    const response = await createBlock({ start: minutes(8), end: minutes(9, 45) });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ days: string[]; blocks: Block[]; op: { id: string } }>();
    expect(body.days).toEqual([DAY]);
    expect(body.blocks).toHaveLength(1);
    expect(body.op.id).toBeTruthy();

    const blocks = await dayBlocks();
    expect(blocks[0]).toMatchObject({ start: 480, end: 585, title: 'Deep: миграция', category: 'deep' });
  });

  it('пустое название превращается в «Без названия»', async () => {
    await createBlock({ start: 480, end: 540, title: '   ' });
    expect((await dayBlocks())[0].title).toBe('Без названия');
  });

  it('отказывается писать блок, у которого конец не позже начала', async () => {
    const response = await createBlock({ start: 540, end: 540 });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain('позже начала');
  });

  it('отказывается от неизвестной категории и битой даты', async () => {
    expect((await createBlock({ start: 480, end: 540, category: 'nope' })).statusCode).toBe(400);
    expect((await createBlock({ start: 480, end: 540, date: '2026-02-31' })).statusCode).toBe(400);
  });

  it('новый блок подрезает существующий, а не удаляет его', async () => {
    await createBlock({ start: minutes(8), end: minutes(12), title: 'Deep #1' });
    await createBlock({ start: minutes(11), end: minutes(13), title: 'Созвон', category: 'ops' });

    const blocks = await dayBlocks();
    expect(blocks.map((b) => [b.title, b.start, b.end])).toEqual([
      ['Deep #1', 480, 660],
      ['Созвон', 660, 780],
    ]);
  });

  it('блок внутри длинного окна делит его на два', async () => {
    await createBlock({ start: minutes(8), end: minutes(12), title: 'Deep #1' });
    await createBlock({ start: minutes(9, 45), end: minutes(10), title: 'Пауза', category: 'rest' });

    const blocks = await dayBlocks();
    expect(blocks.map((b) => [b.title, b.start, b.end])).toEqual([
      ['Deep #1', 480, 585],
      ['Пауза', 585, 600],
      ['Deep #1', 600, 720],
    ]);
    // обе половины остались отдельными блоками с разными id
    expect(new Set(blocks.map((b) => b.id)).size).toBe(3);
  });

  it('overlap=reject возвращает конфликт вместо подрезки', async () => {
    await createBlock({ start: minutes(8), end: minutes(12) });
    const response = await createBlock({ start: minutes(11), end: minutes(13), overlap: 'reject' } as never);
    expect(response.statusCode).toBe(409);
    expect(response.json<{ conflicts: Block[] }>().conflicts).toHaveLength(1);
    expect(await dayBlocks()).toHaveLength(1);
  });

  it('правит блок, не споря с самим собой', async () => {
    const created = (await createBlock({ start: minutes(8), end: minutes(12) })).json<{ blocks: Block[] }>();
    const id = created.blocks[0].id;
    const response = await built.app.inject({
      method: 'PATCH',
      url: `/api/blocks/${id}`,
      payload: { end: minutes(13), note: 'до зелёного дампа' },
    });
    expect(response.statusCode).toBe(200);
    const blocks = await dayBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ id, start: 480, end: 780, note: 'до зелёного дампа' });
  });

  it('переносит блок в другие сутки и сообщает оба дня', async () => {
    const created = (await createBlock({ start: 480, end: 540 })).json<{ blocks: Block[] }>();
    const response = await built.app.inject({
      method: 'PATCH',
      url: `/api/blocks/${created.blocks[0].id}`,
      payload: { date: '2026-07-31' },
    });
    expect(response.json<{ days: string[] }>().days).toEqual(['2026-07-30', '2026-07-31']);
    expect(await dayBlocks(DAY)).toHaveLength(0);
    expect(await dayBlocks('2026-07-31')).toHaveLength(1);
  });

  it('снимает блок и возвращает его назад по undo', async () => {
    const created = (await createBlock({ start: 480, end: 540 })).json<{ blocks: Block[] }>();
    const id = created.blocks[0].id;

    const removed = await built.app.inject({ method: 'DELETE', url: `/api/blocks/${id}` });
    expect(removed.statusCode).toBe(200);
    expect(await dayBlocks()).toHaveLength(0);

    const undo = await built.app.inject({ method: 'POST', url: '/api/undo', payload: {} });
    expect(undo.statusCode).toBe(200);
    const back = await dayBlocks();
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ id, start: 480, end: 540 });
  });

  it('404 на блок, которого нет', async () => {
    expect((await built.app.inject({ method: 'DELETE', url: '/api/blocks/bdeadbeef' })).statusCode).toBe(404);
  });
});

describe('сутки целиком', () => {
  it('применяет встроенный шаблон', async () => {
    const response = await built.app.inject({
      method: 'PUT',
      url: `/api/days/${DAY}`,
      payload: { templateId: 'work' },
    });
    expect(response.statusCode).toBe(200);
    const blocks = await dayBlocks();
    expect(blocks).toHaveLength(21);
    expect(blocks[0]).toMatchObject({ start: 360, title: 'Подъём, вода' });
    expect(blocks[blocks.length - 1].end).toBe(1440);
  });

  it('шаблон «Очистить сутки» снимает всю разметку, undo возвращает', async () => {
    await built.app.inject({ method: 'PUT', url: `/api/days/${DAY}`, payload: { templateId: 'work' } });
    await built.app.inject({ method: 'PUT', url: `/api/days/${DAY}`, payload: { templateId: 'clear' } });
    expect(await dayBlocks()).toHaveLength(0);

    await built.app.inject({ method: 'POST', url: '/api/undo', payload: {} });
    expect(await dayBlocks()).toHaveLength(21);
  });

  it('не принимает сутки, где блоки пересекаются между собой', async () => {
    const response = await built.app.inject({
      method: 'PUT',
      url: `/api/days/${DAY}`,
      payload: {
        blocks: [
          { start: 480, end: 600, title: 'a', category: 'deep' },
          { start: 540, end: 660, title: 'b', category: 'ops' },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain('пересекаются');
  });
});

describe('раскатка', () => {
  beforeEach(async () => {
    await built.app.inject({ method: 'PUT', url: `/api/days/${DAY}`, payload: { templateId: 'work' } });
  });

  it('копирует сутки на будни недели и умеет откатиться', async () => {
    const response = await built.app.inject({
      method: 'POST',
      url: '/api/duplicate',
      payload: { sourceDate: DAY, scope: 'workweek', mode: 'replace', weekdays: [1, 2, 3, 4, 5] },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ targets: string[]; days: string[] }>();
    expect(body.targets).toEqual(['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-31']);
    expect(await dayBlocks('2026-07-28')).toHaveLength(21);
    // источник не тронут
    expect(await dayBlocks(DAY)).toHaveLength(21);

    await built.app.inject({ method: 'POST', url: '/api/undo', payload: {} });
    expect(await dayBlocks('2026-07-28')).toHaveLength(0);
    expect(await dayBlocks(DAY)).toHaveLength(21);
  });

  it('режим merge подрезает то, что уже стоит в приёмнике', async () => {
    await built.app.inject({
      method: 'POST',
      url: '/api/blocks',
      payload: { date: '2026-07-31', start: 0, end: 1440, title: 'Сон', category: 'rest' },
    });
    await built.app.inject({
      method: 'POST',
      url: '/api/duplicate',
      payload: { sourceDate: DAY, scope: 'tomorrow', mode: 'merge' },
    });
    const blocks = await dayBlocks('2026-07-31');
    // сутки были заняты целиком: остались только куски до 06:00 и копии
    expect(blocks[0]).toMatchObject({ title: 'Сон', start: 0, end: 360 });
    expect(blocks).toHaveLength(22);
  });

  it('копирует один блок, не трогая остальную разметку приёмника', async () => {
    const source = await dayBlocks();
    const one = source.find((b) => b.title === 'Спортзал')!;
    await built.app.inject({
      method: 'POST',
      url: '/api/duplicate',
      payload: { sourceDate: DAY, blockIds: [one.id], scope: 'tomorrow', mode: 'merge' },
    });
    const target = await dayBlocks('2026-07-31');
    expect(target).toHaveLength(1);
    expect(target[0]).toMatchObject({ title: 'Спортзал', start: one.start, end: one.end });
  });

  it('ругается на пустой источник и на неизвестный режим', async () => {
    const empty = await built.app.inject({
      method: 'POST',
      url: '/api/duplicate',
      payload: { sourceDate: '2026-09-09', scope: 'tomorrow', mode: 'merge' },
    });
    expect(empty.statusCode).toBe(400);

    const bad = await built.app.inject({
      method: 'POST',
      url: '/api/duplicate',
      payload: { sourceDate: DAY, scope: 'вечность', mode: 'merge' },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('настройки, категории, шаблоны', () => {
  it('меняет настройки и валидирует значения', async () => {
    const ok = await built.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { theme: 'plasma', slotMinutes: 30, crt: false },
    });
    expect(ok.json<{ settings: unknown }>().settings).toMatchObject({
      theme: 'plasma',
      slotMinutes: 30,
      crt: false,
      dayStart: 6,
    });

    expect(
      (await built.app.inject({ method: 'PATCH', url: '/api/settings', payload: { slotMinutes: 7 } }))
        .statusCode,
    ).toBe(400);
    expect(
      (await built.app.inject({ method: 'PATCH', url: '/api/settings', payload: { theme: 'neon' } }))
        .statusCode,
    ).toBe(400);
  });

  it('добавляет категорию, переименовывает и не даёт удалить занятую', async () => {
    const created = await built.app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { id: 'learn', label: 'учёба', color: 'var(--tok-var)' },
    });
    expect(created.statusCode).toBe(201);

    const renamed = await built.app.inject({
      method: 'PATCH',
      url: '/api/categories/learn',
      payload: { label: 'обучение', color: '#c9b8f0' },
    });
    expect(renamed.json<{ category: { label: string } }>().category.label).toBe('обучение');

    await createBlock({ start: 480, end: 540, category: 'learn' });
    const busy = await built.app.inject({ method: 'DELETE', url: '/api/categories/learn' });
    expect(busy.statusCode).toBe(400);
    expect(busy.json<{ message: string }>().message).toContain('занята');
  });

  it('отклоняет цвет, который не токен и не hex', async () => {
    const response = await built.app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { id: 'bad', label: 'зло', color: 'red; background: url(http://evil)' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('снимает шаблон с суток и применяет его в другой день', async () => {
    await built.app.inject({ method: 'PUT', url: `/api/days/${DAY}`, payload: { templateId: 'focus' } });
    const created = await built.app.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'Мой день', note: 'снято с суток', fromDate: DAY },
    });
    expect(created.statusCode).toBe(201);
    const template = created.json<{ template: DayTemplate }>().template;
    expect(template.rows).toHaveLength(9);
    expect(template.kind).toBe('user');

    await built.app.inject({
      method: 'PUT',
      url: '/api/days/2026-08-05',
      payload: { templateId: template.id },
    });
    expect(await dayBlocks('2026-08-05')).toHaveLength(9);
  });

  it('встроенные шаблоны нельзя править и удалять', async () => {
    expect(
      (await built.app.inject({ method: 'DELETE', url: '/api/templates/work' })).statusCode,
    ).toBe(400);
    expect(
      (
        await built.app.inject({
          method: 'PATCH',
          url: '/api/templates/work',
          payload: { name: 'Взломанный' },
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe('бекап', () => {
  it('экспорт и импорт возвращают базу в то же состояние', async () => {
    await built.app.inject({ method: 'PUT', url: `/api/days/${DAY}`, payload: { templateId: 'work' } });
    const dump = await built.app.inject({ method: 'GET', url: '/api/export' });
    expect(dump.headers['content-disposition']).toContain('shff-planner-');
    const bundle = dump.json<{ blocks: Block[] }>();
    expect(bundle.blocks).toHaveLength(21);

    await built.app.inject({ method: 'PUT', url: `/api/days/${DAY}`, payload: { templateId: 'clear' } });
    expect(await dayBlocks()).toHaveLength(0);

    const restored = await built.app.inject({
      method: 'POST',
      url: '/api/import',
      payload: { ...bundle, mode: 'replace' },
    });
    expect(restored.statusCode).toBe(200);
    expect(await dayBlocks()).toHaveLength(21);
  });

  it('не принимает бекап чужого приложения', async () => {
    const response = await built.app.inject({
      method: 'POST',
      url: '/api/import',
      payload: { app: 'not-shff', blocks: [] },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('демо-данные', () => {
  it('SHFF_SEED=demo засеивает неделю вокруг сегодня', async () => {
    const demo = await makeApp({ seed: 'demo' });
    try {
      expect(demo.seed.demoDays).toBe(9);
      const health = await demo.app.inject({ method: 'GET', url: '/api/health' });
      expect(health.json<{ db: { blocks: number } }>().db.blocks).toBeGreaterThan(50);
    } finally {
      await demo.app.close();
    }
  });
});
