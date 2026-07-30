/* Русская плюрализация: «1 блок», «2 блока», «5 блоков». */

export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

export function pluralBlocks(n: number): string {
  return n + ' ' + plural(n, ['блок', 'блока', 'блоков']);
}

export function pluralDays(n: number): string {
  return n + ' ' + plural(n, ['день', 'дня', 'дней']);
}
