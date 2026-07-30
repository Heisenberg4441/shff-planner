import { describe, expect, it } from 'vitest';

import { findConflicts, mergeIntervals, planOverlaps, subtractIntervals } from '../src/overlap';
import type { Block } from '../src/types';

function block(id: string, start: number, end: number): Block {
  return { id, date: '2026-07-30', start, end, title: id, category: 'deep', note: '' };
}

describe('интервальная арифметика', () => {
  it('склеивает касающиеся и пересекающиеся отрезки', () => {
    expect(mergeIntervals([{ start: 0, end: 10 }, { start: 10, end: 20 }])).toEqual([
      { start: 0, end: 20 },
    ]);
    expect(mergeIntervals([{ start: 0, end: 10 }, { start: 5, end: 7 }])).toEqual([
      { start: 0, end: 10 },
    ]);
    expect(mergeIntervals([{ start: 30, end: 40 }, { start: 0, end: 10 }])).toEqual([
      { start: 0, end: 10 },
      { start: 30, end: 40 },
    ]);
  });

  it('вырезает куски', () => {
    expect(subtractIntervals(0, 100, [{ start: 40, end: 60 }])).toEqual([
      { start: 0, end: 40 },
      { start: 60, end: 100 },
    ]);
    expect(subtractIntervals(0, 100, [{ start: 0, end: 100 }])).toEqual([]);
    expect(subtractIntervals(0, 100, [{ start: 90, end: 200 }])).toEqual([{ start: 0, end: 90 }]);
    // огрызки короче минуты не выживают
    expect(subtractIntervals(0, 100, [{ start: 1, end: 100 }])).toEqual([{ start: 0, end: 1 }]);
  });
});

describe('план перекрытий', () => {
  it('не трогает то, что не пересекается', () => {
    const plan = planOverlaps([block('a', 480, 600)], [{ start: 600, end: 660 }]);
    expect(plan.untouched.map((b) => b.id)).toEqual(['a']);
    expect(plan.removed).toEqual([]);
    expect(plan.fragments).toEqual([]);
  });

  it('подрезает край, а не удаляет блок целиком', () => {
    // 08:00–12:00 и новый блок 11:00–13:00
    const plan = planOverlaps([block('a', 480, 720)], [{ start: 660, end: 780 }]);
    expect(plan.removed).toEqual([]);
    expect(plan.fragments).toHaveLength(1);
    expect(plan.fragments[0]).toMatchObject({ start: 480, end: 660, index: 0 });
  });

  it('делит блок на два, если новый лёг в середину', () => {
    // четырёхчасовое окно и пятнадцатиминутная пауза внутри
    const plan = planOverlaps([block('a', 480, 720)], [{ start: 585, end: 600 }]);
    expect(plan.removed).toEqual([]);
    expect(plan.fragments.map((f) => [f.start, f.end, f.index])).toEqual([
      [480, 585, 0],
      [600, 720, 1],
    ]);
  });

  it('снимает блок, накрытый полностью', () => {
    const plan = planOverlaps([block('a', 600, 660)], [{ start: 540, end: 720 }]);
    expect(plan.removed.map((b) => b.id)).toEqual(['a']);
    expect(plan.fragments).toEqual([]);
  });

  it('обрабатывает несколько новых блоков сразу — раскатка суток', () => {
    const existing = [block('a', 480, 720), block('b', 780, 900)];
    const plan = planOverlaps(existing, [
      { start: 600, end: 620 },
      { start: 860, end: 1000 },
    ]);
    expect(plan.affected.map((b) => b.id)).toEqual(['a', 'b']);
    expect(plan.fragments.map((f) => [f.source.id, f.start, f.end])).toEqual([
      ['a', 480, 600],
      ['a', 620, 720],
      ['b', 780, 860],
    ]);
  });

  it('находит конфликты и умеет игнорировать сам блок при правке', () => {
    const existing = [block('a', 480, 600), block('b', 600, 660)];
    expect(findConflicts(existing, { start: 500, end: 700 }).map((b) => b.id)).toEqual(['a', 'b']);
    expect(findConflicts(existing, { start: 500, end: 700 }, 'a').map((b) => b.id)).toEqual(['b']);
    // касание границей — не конфликт
    expect(findConflicts(existing, { start: 660, end: 700 })).toEqual([]);
  });
});
