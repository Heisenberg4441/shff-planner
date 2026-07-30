import type { ReactNode } from 'react';

export function PageHead(): ReactNode {
  return (
    <div className="pl-head">
      <div>
        <span className="pl-kicker">
          $ shff-plan open --granularity=minute
          <span className="pl-caret">_</span>
        </span>
        <h1 className="pl-h1">Планировщик дня</h1>
      </div>
      <p className="pl-lede">
        Не календарь встреч, а полное расписание суток — поминутно. Клик по ячейке ставит блок, дубль
        растягивает день на неделю или месяц.
      </p>
    </div>
  );
}
