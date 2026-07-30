import type { CSSProperties } from 'react';

/**
 * Переменные геометрии для инлайн-стиля. Всё остальное живёт в CSS —
 * компоненты передают только числа, которые нельзя знать заранее.
 */
export function vars(values: Record<string, string | number>): CSSProperties {
  return values as CSSProperties;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
