import type { ReactNode } from 'react';

import { usePlanner } from '../state/usePlanner';

export function Footer(): ReactNode {
  const { state } = usePlanner();

  return (
    <footer className="pl-footer">
      <span className="pl-slogan">Freedom can only live at home.</span>
      <span className="pl-keys">
        <kbd className="kbd">D</kbd>
        <kbd className="kbd">W</kbd>
        <kbd className="kbd">M</kbd>
        <span>вид</span>
        <kbd className="kbd gap">N</kbd>
        <span>блок</span>
        <kbd className="kbd gap">C</kbd>
        <span>дубль</span>
        <kbd className="kbd gap">T</kbd>
        <span>сегодня</span>
        <kbd className="kbd gap">←</kbd>
        <kbd className="kbd">→</kbd>
        <span>дни</span>
      </span>
      <span className="pl-footer-tag">
        SHFF PLANNER {state.server?.version ?? ''} · ЛОКАЛЬНАЯ БАЗА · БЕЗ ТРЕКИНГА
      </span>
    </footer>
  );
}
