import { useCallback, useEffect, useState } from 'react';
import { api, UNAUTHORIZED_EVENT } from './lib/api';
import { CatalogProvider } from './lib/catalog';
import { ExercisesView } from './components/ExercisesView';
import { HistoryView } from './components/HistoryView';
import { LoginScreen } from './components/LoginScreen';
import { SessionScreen } from './components/SessionScreen';
import { SettingsView } from './components/SettingsView';
import { Starfield } from './components/Starfield';
import { TodayView } from './components/TodayView';
import { TABS, TopBar, type Tab } from './components/TopBar';
import { WorkoutsView } from './components/WorkoutsView';
import { Spinner } from './components/ui';

function tabFromHash(): Tab {
  const h = window.location.hash.replace('#', '') as Tab;
  return TABS.some((t) => t.id === h) ? h : 'today';
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => setAuthed(r.authenticated))
      .catch(() => setAuthed(false));
    const onUnauthorized = () => setAuthed(false);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (authed === null) {
    return (
      <>
        <Starfield />
        <div className="flex min-h-dvh items-center justify-center">
          <Spinner className="size-6" />
        </div>
      </>
    );
  }

  if (!authed) {
    return (
      <>
        <Starfield />
        <LoginScreen onEnter={() => setAuthed(true)} />
      </>
    );
  }

  return (
    <CatalogProvider>
      <Starfield />
      <Shell
        onLogout={async () => {
          await api.logout().catch(() => {});
          setAuthed(false);
        }}
      />
    </CatalogProvider>
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [sessionId, setSessionId] = useState<number | null>(null);
  /** Muda quando uma sessão termina, para as telas recarregarem. */
  const [version, setVersion] = useState(0);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    history.replaceState(null, '', `#${t}`);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      <TopBar tab={tab} onTab={setTab} />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-28 sm:px-6 md:pb-16">
        {tab === 'today' && <TodayView key={version} onOpenSession={setSessionId} onGoTo={setTab} />}
        {tab === 'workouts' && <WorkoutsView onOpenSession={setSessionId} />}
        {tab === 'exercises' && <ExercisesView />}
        {tab === 'history' && <HistoryView key={version} onOpenSession={setSessionId} />}
        {tab === 'settings' && <SettingsView onLogout={onLogout} />}
      </main>

      {sessionId != null && (
        <SessionScreen
          key={sessionId}
          sessionId={sessionId}
          onClose={() => {
            setSessionId(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
