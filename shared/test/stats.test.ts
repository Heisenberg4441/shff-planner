import { describe, expect, it } from 'vitest';

import { dayGaps, gridStartMinute, longestRun, offGridMinutes, summarizeDay, switchCount } from '../src/stats';
import type { Block } from '../src/types';

let seq = 0;
function b(start: number, end: number, category = 'deep'): Block {
  return { id: 'b' + ++seq, date: '2026-07-30', start, end, title: 't', category, note: '' };
}

describe('метрики суток', () => {
  it('находит дыры от начала сетки до 24:00', () => {
    const blocks = [b(480, 600), b(660, 720)];
    expect(dayGaps(blocks, 360)).toEqual([
      { start: 360, end: 480 },
      { start: 600, end: 660 },
      { start: 720, end: 1440 },
    ]);
  });

  it('дыры короче 15 минут не считаются дырами', () => {
    const blocks = [b(360, 480), b(490, 1440)];
    expect(dayGaps(blocks, 360)).toEqual([]);
  });

  it('сетка расширяется вверх, если разметка начинается раньше настройки', () => {
    expect(gridStartMinute([], 6)).toBe(360);
    expect(gridStartMinute([b(300, 400)], 6)).toBe(300);
    expect(gridStartMinute([b(310, 400)], 6)).toBe(300);
    expect(gridStartMinute([b(400, 500)], 6)).toBe(360);
  });

  it('считает минуты выше начала сетки', () => {
    expect(offGridMinutes([b(300, 400)], 360)).toBe(60);
    expect(offGridMinutes([b(400, 500)], 360)).toBe(0);
  });

  it('склеивает только соприкасающиеся блоки одной категории', () => {
    expect(longestRun([b(480, 600), b(600, 720)], 'deep')).toBe(240);
    expect(longestRun([b(480, 600), b(615, 720)], 'deep')).toBe(120);
    expect(longestRun([b(480, 600, 'ops')], 'deep')).toBe(0);
  });

  it('считает переключения характера занятий', () => {
    expect(switchCount([b(0, 60, 'deep'), b(60, 120, 'deep'), b(120, 180, 'ops')])).toBe(1);
    expect(switchCount([b(0, 60, 'deep'), b(60, 120, 'ops'), b(120, 180, 'deep')])).toBe(2);
    expect(switchCount([])).toBe(0);
  });

  it('сводка по суткам', () => {
    const summary = summarizeDay([b(480, 600, 'deep'), b(600, 660, 'ops'), b(660, 780, 'deep')], {
      gridStart: 360,
      focusCategoryId: 'deep',
    });
    expect(summary.planned).toBe(300);
    expect(summary.free).toBe(1140);
    expect(summary.blocks).toBe(3);
    expect(summary.byCategory).toEqual({ deep: 240, ops: 60 });
    expect(summary.focusTotal).toBe(240);
    expect(summary.focusWindow).toBe(120);
    expect(summary.switches).toBe(2);
    expect(summary.first).toBe(480);
    expect(summary.last).toBe(780);
  });
});
