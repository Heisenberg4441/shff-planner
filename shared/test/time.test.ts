import { describe, expect, it } from 'vitest';

import {
  addDays,
  dateKey,
  eachDate,
  fmtTime,
  humanDur,
  isDateKey,
  isoWeek,
  monday,
  monthGridRange,
  parseDateKey,
  parseTime,
  parseTimeLoose,
  shiftDateKey,
  weekRange,
} from '../src/time';
import { pluralBlocks, pluralDays } from '../src/plural';

describe('время внутри суток', () => {
  it('печатает минуты как часы, включая правую границу суток', () => {
    expect(fmtTime(0)).toBe('00:00');
    expect(fmtTime(500)).toBe('08:20');
    expect(fmtTime(1439)).toBe('23:59');
    expect(fmtTime(1440)).toBe('24:00');
  });

  it('разбирает HH:MM обратно', () => {
    expect(parseTime('08:20')).toBe(500);
    expect(parseTime('24:00')).toBe(1440);
    expect(parseTime('')).toBe(0);
  });

  it('разбирает то, что человек набил руками', () => {
    expect(parseTimeLoose('9')).toBe(540);
    expect(parseTimeLoose('930')).toBe(570);
    expect(parseTimeLoose('0930')).toBe(570);
    expect(parseTimeLoose('9:3')).toBe(543);
    expect(parseTimeLoose('9.30')).toBe(570);
    expect(parseTimeLoose('24:00')).toBe(1440);
    expect(parseTimeLoose('24:01')).toBeNull();
    expect(parseTimeLoose('99:99')).toBeNull();
    expect(parseTimeLoose('утро')).toBeNull();
    expect(parseTimeLoose('')).toBeNull();
  });

  it('человеческая длительность', () => {
    expect(humanDur(45)).toBe('45 мин');
    expect(humanDur(60)).toBe('1 ч');
    expect(humanDur(150)).toBe('2 ч 30 м');
    expect(humanDur(0)).toBe('0 мин');
  });
});

describe('календарь', () => {
  it('ключ дня и разбор туда-обратно', () => {
    expect(dateKey(new Date(2026, 6, 30))).toBe('2026-07-30');
    expect(dateKey(parseDateKey('2026-01-05'))).toBe('2026-01-05');
    expect(isDateKey('2026-07-30')).toBe(true);
    expect(isDateKey('2026-02-31')).toBe(false);
    expect(isDateKey('2026-7-30')).toBe(false);
    expect(isDateKey('вчера')).toBe(false);
  });

  it('сдвиг дней переживает границу месяца', () => {
    expect(shiftDateKey('2026-07-31', 1)).toBe('2026-08-01');
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(dateKey(addDays(parseDateKey('2026-12-31'), 1))).toBe('2027-01-01');
  });

  it('неделя начинается с понедельника', () => {
    // 2026-07-30 — четверг
    expect(dateKey(monday(parseDateKey('2026-07-30')))).toBe('2026-07-27');
    // воскресенье относится к предыдущему понедельнику, а не к следующему
    expect(dateKey(monday(parseDateKey('2026-08-02')))).toBe('2026-07-27');
    expect(weekRange('2026-07-30')).toEqual({ from: '2026-07-27', to: '2026-08-02' });
  });

  it('сетка месяца — ровно 42 дня от понедельника', () => {
    const range = monthGridRange('2026-07-30');
    expect(range.from).toBe('2026-06-29');
    expect(eachDate(range)).toHaveLength(42);
  });

  it('номер недели по ISO', () => {
    expect(isoWeek(parseDateKey('2026-01-01'))).toBe(1);
    expect(isoWeek(parseDateKey('2026-07-30'))).toBe(31);
  });
});

describe('плюрализация', () => {
  it('считает блоки по-русски', () => {
    expect(pluralBlocks(1)).toBe('1 блок');
    expect(pluralBlocks(2)).toBe('2 блока');
    expect(pluralBlocks(5)).toBe('5 блоков');
    expect(pluralBlocks(11)).toBe('11 блоков');
    expect(pluralBlocks(21)).toBe('21 блок');
    expect(pluralBlocks(0)).toBe('0 блоков');
  });

  it('и дни', () => {
    expect(pluralDays(1)).toBe('1 день');
    expect(pluralDays(3)).toBe('3 дня');
    expect(pluralDays(14)).toBe('14 дней');
  });
});
