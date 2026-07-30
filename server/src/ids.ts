import { randomBytes } from 'node:crypto';

/** id блока: короткий, но не угадываемый — 'b' + 12 hex. */
export function uid(prefix = 'b'): string {
  return prefix + randomBytes(6).toString('hex');
}

export function nowIso(): string {
  return new Date().toISOString();
}
