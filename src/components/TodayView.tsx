import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCog,
  Check,
  Clock,
  Flame,
  Play,
  Plus,
  SkipForward,
  Star,
  StretchHorizontal,
  Timer,
  Trash2,
  Trophy,
} from 'lucide-react';
import { api } from '../lib/api';
import { useCatalog } from '../lib/catalog';
import { formatClock, formatDay, formatDuration, formatSeconds, localDay, relativeDay, relativeTime, targetLabel, WEEKDAYS } from '../lib/format';
import type { Exercise, Today, WorkoutLite } from '../lib/types';
import { useCountdown } from '../lib/timers';
import { formatEstimate } from '../../shared/estimate';
import type { Tab } from './TopBar';
import { QuickLogModal } from './QuickLog';
import {
  Button,
  Chip,
  cx,
  DurationInput,
  EmptyState,
  Field,
  Input,
  Modal,
  Notice,
  Panel,
  SectionTitle,
  Spinner,
  Toast,
} from './ui';

export function TodayView({
  onOpenSession,
  onGoTo,
}: {
  onOpenSession: (id: number) => void;
  onGoTo: (t: Tab) => void;
}) {
  const { exercises } = useCatalog();
  const day = localDay();
  const weekday = new Date().getDay();
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | 'free' | null>(null);
  const [checkin, setCheckin] = useState<Exercise | 'free' | null>(null);
  const [quick, setQuick] = useState<{ workoutId: number; exerciseId: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; record: boolean } | null>(null);
  /** Treinos que você escolheu fazer hoje (fica lembrado só neste dia, neste aparelho). */
  const [picked, setPicked] = useDayPick(day);

  const load = useCallback(() => {
    api
      .today(day, weekday)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [day, weekday]);

  useEffect(load, [load]);

  const stretches = useMemo(
    () => exercises.filter((e) => !e.archived && (e.kind === 'stretch' || e.kind === 'mobility')),
    [exercises],
  );

  /** Abre o treino completo: continua a sessão de hoje desse treino, se já existir. */
  async function open(workoutId: number) {
    const existing = data?.daySessions[workoutId];
    if (existing) return onOpenSession(existing);
    return start(workoutId);
  }

  async function start(workoutId: number | null) {
    setBusy(workoutId ?? 'free');
    try {
      const full = await api.startSession(workoutId, day);
      onOpenSession(full.session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar.');
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <Notice>{error}</Notice>;
  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="size-6" />
      </div>
    );
  }

  const suggestedIds =
    data.program.mode === 'weekly'
      ? data.scheduled.map((w) => w.id)
      : data.upcoming[0]?.workout
        ? [data.upcoming[0].workout.id]
        : [];
  const withProgress = Object.keys(data.progress).map(Number);
  // Padrão: o sugerido do dia + o que já tem série registrada hoje.
  const shown = picked ?? [...new Set([...suggestedIds, ...withProgress])];
  const togglePick = (id: number) =>
    setPicked(shown.includes(id) ? shown.filter((x) => x !== id) : [...shown, id]);

  const hasProgram =
    data.program.mode === 'weekly'
      ? Object.values(data.program.weekly).some((l) => l.length)
      : data.program.rotation.length > 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-dust first-letter:uppercase">{formatDay(day, { weekday: 'long', month: 'long' })}</p>
          <h1 className="font-reader text-4xl leading-tight sm:text-5xl">Hoje</h1>
        </div>
        <div className="flex gap-3">
          <Stat icon={<Flame className="size-4 text-amber" aria-hidden />} value={data.streak} label={data.streak === 1 ? 'dia seguido' : 'dias seguidos'} />
          <Stat value={data.week.sessions} label="treinos em 7 dias" />
          <Stat value={data.week.sets} label="séries em 7 dias" />
        </div>
      </header>

      {error && <Notice>{error}</Notice>}

      {/* Treino livre em andamento (os treinos do programa aparecem nos painéis abaixo). */}
      {data.active.filter((s) => !s.workoutId || s.day !== day).length > 0 && (
        <div className="space-y-2">
          {data.active
            .filter((s) => !s.workoutId || s.day !== day)
            .map((s) => (
              <Panel key={s.id} className="flex flex-wrap items-center gap-3 border-cyan/40 p-4">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-cyan" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="text-xs text-dust">
                    Em andamento · começou {relativeDay(s.day, day)} · {formatDuration(s.durationMs)}
                  </p>
                </div>
                <Button onClick={() => onOpenSession(s.id)}>
                  <Play className="size-4" aria-hidden /> Continuar
                </Button>
              </Panel>
            ))}
        </div>
      )}

      <section>
        <SectionTitle
          action={
            <Button variant="ghost" size="sm" onClick={() => onGoTo('workouts')}>
              <CalendarCog className="size-4" aria-hidden /> Programa
            </Button>
          }
        >
          Treino de hoje
        </SectionTitle>

        {!hasProgram && !data.workouts.length ? (
          <EmptyState
            title="Monte seu programa"
            action={<Button onClick={() => onGoTo('workouts')}>Ir para Treinos</Button>}
          >
            Cadastre seus exercícios, monte os treinos (A, B, C…) e defina se eles seguem os dias da
            semana ou uma sequência livre como A B C A B.
          </EmptyState>
        ) : (
          <>
            <p className="-mt-1 mb-2 text-sm text-dust">
              {suggestedIds.length
                ? `Sugerido para ${data.program.mode === 'weekly' ? WEEKDAYS[weekday]!.toLowerCase() : 'agora'}: ${data.workouts
                    .filter((w) => suggestedIds.includes(w.id))
                    .map((w) => w.code ?? w.name)
                    .join(' + ')}. Toque para escolher outro.`
                : 'Nada programado para hoje. Escolha um treino se quiser treinar.'}
            </p>
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Escolher treinos de hoje">
              {data.workouts.map((w) => {
                const on = shown.includes(w.id);
                const suggested = suggestedIds.includes(w.id);
                return (
                  <button
                    key={w.id}
                    onClick={() => togglePick(w.id)}
                    aria-pressed={on}
                    className={cx(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                      on ? 'border-nebula-soft bg-nebula/25 text-starlight' : 'border-ridge bg-black/20 text-dust hover:border-nebula-soft/60',
                    )}
                  >
                    <span className="flex size-6 items-center justify-center rounded-md text-xs font-semibold text-white" style={{ background: w.color }}>
                      {w.code ?? w.name.slice(0, 1)}
                    </span>
                    <span className="max-w-40 truncate">{w.name}</span>
                    {suggested && <Star className="size-3.5 fill-amber text-amber" aria-label="sugerido" />}
                  </button>
                );
              })}
            </div>

            {data.program.mode === 'rotation' && data.upcoming.length > 1 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-dust">
                Sequência — depois:
                {data.upcoming.slice(1).map((u, i) => (
                  <button
                    key={i}
                    title="Pular para este na sequência"
                    onClick={() => api.setRotationIndex(u.index).then(load).catch((e) => setError(e.message))}
                    className="rounded-full border border-ridge px-2.5 py-0.5 text-xs hover:border-nebula-soft hover:text-starlight"
                  >
                    {u.workout ? (u.workout.code ?? u.workout.name) : 'descanso'}
                  </button>
                ))}
                {!data.upcoming[0]?.workout && (
                  <Button variant="outline" size="sm" onClick={() => api.setRotationIndex(data.program.rotationIndex + 1).then(load).catch((e) => setError(e.message))}>
                    <SkipForward className="size-4" aria-hidden /> Marcar descanso como feito
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-4">
              {data.workouts
                .filter((w) => shown.includes(w.id))
                .sort((x, y) => Number(suggestedIds.includes(y.id)) - Number(suggestedIds.includes(x.id)))
                .map((w) => (
                  <DayWorkoutPanel
                    key={w.id}
                    w={w}
                    suggested={suggestedIds.includes(w.id)}
                    progress={data.progress[w.id] ?? {}}
                    busy={busy === w.id}
                    onOpen={() => open(w.id)}
                    onQuick={(exerciseId) => setQuick({ workoutId: w.id, exerciseId })}
                  />
                ))}
              {!shown.length && <p className="text-sm text-faint">Nenhum treino escolhido para hoje.</p>}
            </div>

            <div className="mt-3">
              <Button variant="ghost" disabled={busy != null} onClick={() => start(null)}>
                <Plus className="size-4" aria-hidden /> Treino livre
              </Button>
            </div>
          </>
        )}
      </section>

      <section>
        <SectionTitle
          action={
            <Button variant="ghost" size="sm" onClick={() => setCheckin('free')}>
              <Plus className="size-4" aria-hidden /> Outro
            </Button>
          }
        >
          Alongamento rápido
        </SectionTitle>
        <p className="-mt-1 mb-3 text-sm text-dust">Um toque para registrar um alongamento feito ao longo do dia.</p>
        {stretches.length ? (
          <div className="flex flex-wrap gap-2">
            {stretches.map((e) => {
              const n = data.checkins.filter((c) => c.exerciseId === e.id).length;
              return (
                <Chip key={e.id} onClick={() => setCheckin(e)} active={n > 0} className="px-3 py-2 text-sm">
                  <StretchHorizontal className="size-4" aria-hidden />
                  {e.name}
                  {n > 0 && <span className="text-cyan">×{n}</span>}
                </Chip>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-faint">
            Cadastre exercícios do tipo “Alongamento” ou “Mobilidade” para eles aparecerem aqui.
          </p>
        )}
      </section>

      <section>
        <SectionTitle>Feito hoje</SectionTitle>
        {data.sessions.length === 0 && data.checkins.length === 0 ? (
          <p className="text-sm text-faint">Nada registrado ainda hoje.</p>
        ) : (
          <div className="space-y-2">
            {data.sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => onOpenSession(s.id)}
                className="glass flex w-full items-center gap-3 rounded-2xl p-4 text-left hover:border-nebula-soft/50"
              >
                <span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="flex-1 font-medium">{s.name}</span>
                {s.status === 'completed' ? (
                  <>
                    <span className="text-sm text-dust">{formatDuration(s.durationMs)}</span>
                    <Check className="size-4 text-lime" aria-hidden />
                  </>
                ) : (
                  <span className="text-xs text-cyan">
                    {Object.values(data.progress[s.workoutId ?? -1] ?? {}).reduce((a, x) => a + x.done, 0)} séries · em andamento
                  </span>
                )}
              </button>
            ))}
            {data.checkins.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-ridge bg-black/15 px-4 py-2.5 text-sm">
                <StretchHorizontal className="size-4 text-cyan" aria-hidden />
                <span className="flex-1">
                  {c.name}
                  {c.seconds ? <span className="text-dust"> · {formatSeconds(c.seconds)}</span> : null}
                  {c.notes && <span className="block text-xs text-faint">{c.notes}</span>}
                </span>
                <span className="text-xs text-faint">
                  {new Date(c.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  aria-label="Apagar check-in"
                  onClick={() => api.deleteCheckin(c.id).then(load)}
                  className="rounded p-1 text-faint hover:text-rose-300"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {quick && (
        <QuickLogModal
          workoutId={quick.workoutId}
          exerciseId={quick.exerciseId}
          day={day}
          onClose={() => setQuick(null)}
          onLogged={(info) => {
            setQuick(null);
            setToast(info);
            load();
          }}
        />
      )}
      {toast && (
        <Toast tone={toast.record ? 'record' : 'info'} onDone={() => setToast(null)}>
          <span className="flex items-center gap-2">
            {toast.record ? <Trophy className="size-4" aria-hidden /> : <Check className="size-4 text-lime" aria-hidden />}
            {toast.text}
          </span>
        </Toast>
      )}

      {checkin && (
        <CheckinModal
          exercise={checkin === 'free' ? null : checkin}
          day={day}
          onClose={() => setCheckin(null)}
          onSaved={() => {
            setCheckin(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Stat({ icon, value, label }: { icon?: React.ReactNode; value: number; label: string }) {
  return (
    <div className="glass rounded-2xl px-3.5 py-2.5 text-center">
      <p className="flex items-center justify-center gap-1 text-2xl font-semibold tabular-nums">
        {icon}
        {value}
      </p>
      <p className="text-[11px] leading-tight text-dust">{label}</p>
    </div>
  );
}

/**
 * Um treino na tela Hoje: cada exercício com o progresso do dia e um botão
 * para registrar a próxima série solta — sem precisar abrir o treino inteiro.
 */
function DayWorkoutPanel({
  w,
  suggested,
  progress,
  busy,
  onOpen,
  onQuick,
}: {
  w: WorkoutLite;
  suggested: boolean;
  progress: Record<string, { done: number; lastAt: string | null }>;
  busy: boolean;
  onOpen: () => void;
  onQuick: (exerciseId: number) => void;
}) {
  const { workouts, exerciseById } = useCatalog();
  const items = workouts.find((x) => x.id === w.id)?.items ?? [];
  const totalTarget = items.reduce((a, it) => a + it.targetSets, 0);
  const totalDone = items.reduce((a, it) => a + Math.min(progress[it.exerciseId]?.done ?? 0, it.targetSets), 0);
  const started = Object.keys(progress).length > 0;

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-start gap-3 p-4 pb-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-white" style={{ background: w.color }}>
          {w.code ?? w.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-lg font-medium">
            <span className="truncate">{w.name}</span>
            {suggested && <span className="rounded-full border border-amber/40 px-2 py-0.5 text-[11px] font-normal text-amber">sugerido hoje</span>}
          </p>
          <p className="text-sm text-dust">
            {totalDone}/{totalTarget} séries
            {w.estimatedSeconds > 0 && (
              <>
                {' · '}
                <span className="inline-flex items-center gap-1 text-cyan" title="30 s por série + o descanso de cada série">
                  <Clock className="size-3.5" aria-hidden /> ≈ {formatEstimate(w.estimatedSeconds)}
                </span>
              </>
            )}
          </p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="h-full rounded-full bg-lime transition-[width]" style={{ width: `${totalTarget ? (totalDone / totalTarget) * 100 : 0}%` }} />
          </div>
        </div>
      </div>

      <ul className="divide-y divide-ridge border-t border-ridge">
        {items.map((it) => {
          const ex = exerciseById.get(it.exerciseId);
          if (!ex) return null;
          const p = progress[it.exerciseId];
          const done = p?.done ?? 0;
          const complete = done >= it.targetSets;
          return (
            <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
              <button onClick={() => onQuick(ex.id)} className="min-w-0 flex-1 text-left">
                <span className={cx('block truncate text-sm', complete ? 'text-lime' : 'text-starlight')}>{ex.name}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-faint">
                  {targetLabel({ ...it, measure: ex.measure, perSide: ex.perSide })}
                  <span className="inline-flex items-center gap-0.5" aria-label={`${done} de ${it.targetSets} séries hoje`}>
                    {Array.from({ length: Math.max(it.targetSets, done) }, (_, i) => (
                      <span
                        key={i}
                        className={cx('inline-block size-2 rounded-full', i < done ? (i >= it.targetSets ? 'bg-cyan' : 'bg-lime') : 'bg-white/15')}
                      />
                    ))}
                  </span>
                  {p?.lastAt && <span>· {relativeTime(p.lastAt)}</span>}
                </span>
              </button>
              <Button size="sm" variant={complete ? 'ghost' : 'outline'} onClick={() => onQuick(ex.id)} aria-label={`Registrar série de ${ex.name}`}>
                <Plus className="size-4" aria-hidden /> Série
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-ridge p-3">
        <Button className={cx('w-full', !started && suggested && 'breathe')} disabled={busy} onClick={onOpen}>
          {busy ? <Spinner /> : <Play className="size-4" aria-hidden />}
          {started ? 'Abrir treino completo' : 'Começar treino completo'}
        </Button>
      </div>
    </Panel>
  );
}

/** Escolha de treinos do dia, lembrada no aparelho só para aquela data. */
function useDayPick(day: string) {
  const key = `gh:pick:${day}`;
  const [value, setValue] = useState<number[] | null>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as number[]) : null;
    } catch {
      return null;
    }
  });
  const set = (ids: number[]) => {
    setValue(ids);
    try {
      localStorage.setItem(key, JSON.stringify(ids));
    } catch {
      /* navegação privada */
    }
  };
  return [value, set] as const;
}

/** Check-in de alongamento com timer opcional (conta regressiva e vibra no fim). */
function CheckinModal({
  exercise,
  day,
  onClose,
  onSaved,
}: {
  exercise: Exercise | null;
  day: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [seconds, setSeconds] = useState<number | null>(exercise?.defaultSeconds ?? 30);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const timer = useCountdown();

  async function save() {
    try {
      await api.createCheckin({
        exerciseId: exercise?.id ?? null,
        name: exercise ? null : name.trim() || 'Alongamento',
        day,
        seconds,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }

  return (
    <Modal
      title={exercise ? exercise.name : 'Alongamento avulso'}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2 pb-1">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>
            <Check className="size-4" aria-hidden /> Registrar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!exercise && (
          <Field label="O que você alongou">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: pescoço, ombros" autoFocus />
          </Field>
        )}
        {exercise?.instructions && <p className="text-sm leading-relaxed text-dust">{exercise.instructions}</p>}
        <div className="flex items-end gap-3">
          <Field label={`Tempo${exercise?.perSide ? ' por lado' : ''}`}>
            <DurationInput value={seconds} onChange={setSeconds} className="w-32" />
          </Field>
          <Button
            variant="outline"
            onClick={() => (timer.running ? timer.stop() : timer.start(seconds ?? 30))}
          >
            <Timer className="size-4" aria-hidden />
            {timer.running ? `${formatClock(timer.left)} — parar` : 'Iniciar timer'}
          </Button>
        </div>
        <Field label="Observação">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Como estava a amplitude, dor…" />
        </Field>
        {error && <Notice>{error}</Notice>}
      </div>
    </Modal>
  );
}
