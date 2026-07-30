import type { ReactNode } from 'react';

import { GapsPanel } from './panels/GapsPanel';
import { NowPanel } from './panels/NowPanel';
import { StatsPanel } from './panels/StatsPanel';
import { TemplatesPanel } from './panels/TemplatesPanel';
import { ThemePanel } from './panels/ThemePanel';

export function Sidebar(): ReactNode {
  return (
    <aside className="pl-aside">
      <ThemePanel />
      <NowPanel />
      <StatsPanel />
      <GapsPanel />
      <TemplatesPanel />
    </aside>
  );
}
