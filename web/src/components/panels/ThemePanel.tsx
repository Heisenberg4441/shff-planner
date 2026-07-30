import type { ReactNode } from 'react';

import { cx, vars } from '../../lib/css';
import { THEME_OPTIONS } from '../../lib/themes';
import { usePlanner } from '../../state/usePlanner';

export function ThemePanel(): ReactNode {
  const { state, actions } = usePlanner();

  return (
    <div className="panel pl-panel">
      <div className="pl-panel-title">// ЦВЕТОВАЯ СХЕМА</div>
      <div className="pl-theme-grid">
        {THEME_OPTIONS.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={cx('pl-theme', state.settings.theme === theme.id && 'on')}
            onClick={() => actions.setTheme(theme.id)}
          >
            <span className="pl-swatch" style={vars({ '--sw': theme.swatch })} />
            {theme.label}
          </button>
        ))}
      </div>
    </div>
  );
}
