import type { ReactNode } from 'react';

import { BlockDialog } from './components/BlockDialog';
import { DayGrid } from './components/DayGrid';
import { DuplicateDialog } from './components/DuplicateDialog';
import { Footer } from './components/Footer';
import { Login } from './components/Login';
import { MonthGrid } from './components/MonthGrid';
import { PageHead } from './components/PageHead';
import { SettingsDialog } from './components/SettingsDialog';
import { Setup } from './components/Setup';
import { Sidebar } from './components/Sidebar';
import { Toasts } from './components/Toasts';
import { Toolbar } from './components/Toolbar';
import { TopBar } from './components/TopBar';
import { WeekGrid } from './components/WeekGrid';
import { PlannerProvider } from './state/PlannerProvider';
import { usePlanner } from './state/usePlanner';

export function App(): ReactNode {
  return (
    <PlannerProvider>
      <Shell />
    </PlannerProvider>
  );
}

function Shell(): ReactNode {
  const { state } = usePlanner();

  if (state.phase === 'loading') {
    return (
      <div className="pl-splash">
        <span>
          $ shff-plan open<span className="pl-caret">_</span>
        </span>
      </div>
    );
  }

  if (state.phase === 'error') return <Failure message={state.fatal ?? 'Неизвестная ошибка.'} />;

  // тосты нужны и на входе: «пароль не подошёл» человек должен увидеть
  if (state.phase === 'setup' || state.phase === 'auth') {
    return (
      <>
        {state.phase === 'setup' ? <Setup /> : <Login />}
        <Toasts />
      </>
    );
  }

  return <Planner />;
}

function Failure({ message }: { message: string }): ReactNode {
  return (
    <div className="pl-fail">
      <div className="panel pl-fail-box">
        <h2>Сервис не отвечает</h2>
        <p>
          Интерфейс загрузился, но API недоступен. Проверь, что контейнер жив, и посмотри его логи:
          <br />
          <code>docker compose logs -f planner</code>
        </p>
        <pre>{message}</pre>
        <button className="btn primary sm" type="button" onClick={() => window.location.reload()}>
          [&nbsp;Перезагрузить&nbsp;]
        </button>
      </div>
    </div>
  );
}

function Planner(): ReactNode {
  const { state } = usePlanner();

  return (
    <div className="pl-app">
      {state.settings.crt && <div className="scanlines" />}
      <TopBar />
      <main className="pl-main">
        <PageHead />
        <Toolbar />
        <div className="pl-layout">
          <div className="pl-canvas">
            {state.view === 'day' && <DayGrid />}
            {state.view === 'week' && <WeekGrid />}
            {state.view === 'month' && <MonthGrid />}
          </div>
          <Sidebar />
        </div>
      </main>
      <Footer />
      {state.dialog && <BlockDialog />}
      {state.dup && <DuplicateDialog />}
      {state.settingsOpen && <SettingsDialog />}
      <Toasts />
    </div>
  );
}
