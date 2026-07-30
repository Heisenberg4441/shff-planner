import type { ThemeId } from '../../../shared/src/types';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  swatch: string;
}

/** Акцентные семьи. Поверхности между темами почти не меняются — это держит продукты в одной семье. */
export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'phosphor', label: 'phosphor', swatch: '#33ff99' },
  { id: 'dock', label: 'dock', swatch: '#33e0ff' },
  { id: 'amber', label: 'amber', swatch: '#ffb454' },
  { id: 'plasma', label: 'plasma', swatch: '#ff5f6d' },
  { id: 'ice', label: 'ice', swatch: '#cfe3ff' },
];

/** Палитра для категорий: токены темы сначала, потом фиксированные цвета. */
export const CATEGORY_COLORS = [
  'var(--accent)',
  'var(--note)',
  'var(--warn)',
  'var(--muted)',
  'var(--danger)',
  'var(--tok-var)',
  'var(--tok-str)',
];
