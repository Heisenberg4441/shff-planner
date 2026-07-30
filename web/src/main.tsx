import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/* дизайн-система целиком: токены, база, компоненты, CRT-слой */
import '../../_ds/shff-design-system-97e1cccc-d574-4ca0-8cca-082936ace282/styles.css';
/* расширения продукта поверх неё */
import './styles/themes-extra.css';
import './styles/planner.css';

import { App } from './App';

const host = document.getElementById('root');
if (!host) throw new Error('Не найден #root — index.html подменили?');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
