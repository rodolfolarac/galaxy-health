import { CalendarDays, Dumbbell, History, ListChecks, Settings2 } from 'lucide-react';
import { cx } from './ui';

export type Tab = 'today' | 'workouts' | 'exercises' | 'history' | 'settings';

export const TABS: { id: Tab; label: string; Icon: typeof Dumbbell }[] = [
  { id: 'today', label: 'Hoje', Icon: CalendarDays },
  { id: 'workouts', label: 'Treinos', Icon: ListChecks },
  { id: 'exercises', label: 'Exercícios', Icon: Dumbbell },
  { id: 'history', label: 'Histórico', Icon: History },
  { id: 'settings', label: 'Ajustes', Icon: Settings2 },
];

/** Barra superior (desktop) + barra de abas no rodapé (celular), como nos apps de academia. */
export function TopBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-ridge bg-void/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex shrink-0 items-center gap-2">
            <span aria-hidden className="text-lg text-nebula-soft">
              ✦
            </span>
            <span className="font-reader text-xl tracking-tight">Galaxy Health</span>
          </div>

          <nav className="ml-auto hidden items-center gap-1 rounded-xl border border-ridge bg-black/25 p-1 md:flex">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => onTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
                  tab === id ? 'bg-nebula/85 text-white' : 'text-dust hover:bg-white/6 hover:text-starlight',
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-ridge bg-void/80 pt-1.5 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => onTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cx(
                'flex flex-col items-center gap-0.5 rounded-lg py-1 text-[11px] transition-colors',
                tab === id ? 'text-nebula-soft' : 'text-faint',
              )}
            >
              <Icon aria-hidden className="size-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
