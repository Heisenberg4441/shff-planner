import { describe, expect, it } from 'vitest';

import { duplicationTargets, normalizeWeekdays } from '../src/dup';

// 2026-07-30 — четверг, неделя 27.07 (пн) — 02.08 (вс)
const THU = '2026-07-30';

describe('раскатка: дни-приёмники', () => {
  it('на завтра — ровно один день', () => {
    expect(duplicationTargets(THU, 'tomorrow')).toEqual(['2026-07-31']);
  });

  it('до конца недели — без источника и без следующей недели', () => {
    expect(duplicationTargets(THU, 'restweek')).toEqual(['2026-07-31', '2026-08-01', '2026-08-02']);
  });

  it('будни этой недели — пн–пт, источник исключён', () => {
    expect(duplicationTargets(THU, 'workweek')).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-31',
    ]);
  });

  it('вся неделя — семь дней минус источник', () => {
    expect(duplicationTargets(THU, 'week')).toHaveLength(6);
  });

  it('месяц фильтруется выбранными днями недели', () => {
    const mondays = duplicationTargets(THU, 'month', [1]);
    expect(mondays).toEqual(['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27']);
    // июль 2026 начинается со среды: первый понедельник — 6-е
    const thursdays = duplicationTargets(THU, 'month', [4]);
    expect(thursdays).toContain('2026-07-02');
    expect(thursdays).not.toContain(THU);
  });

  it('дни недели вперёд — четыре недели', () => {
    const targets = duplicationTargets(THU, 'weekdays', [1, 2, 3, 4, 5]);
    expect(targets).toHaveLength(20);
    expect(targets[0]).toBe('2026-07-31');
    expect(targets.every((d) => d > THU)).toBe(true);
  });

  it('квартал — 90 дней вперёд по выбранным дням', () => {
    const targets = duplicationTargets(THU, 'quarter', [6, 0]);
    expect(targets.length).toBeGreaterThan(20);
    expect(targets.every((d) => d > THU)).toBe(true);
  });

  it('пустой список дней недели даёт пустой результат', () => {
    expect(duplicationTargets(THU, 'month', [])).toEqual([]);
  });

  it('нормализует мусор в списке дней недели', () => {
    expect(normalizeWeekdays([1, 1, 9, -2, '3', null])).toEqual([1, 3]);
    expect(normalizeWeekdays('пн')).toEqual([]);
  });
});
