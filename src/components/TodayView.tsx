import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCog,
  Check,
  Clock,
  Flame,
  Play,
  Plus,
  SkipForward,
  StretchHorizontal,
  Timer,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useCatalog } from '../lib/catalog';
import { formatDay, formatDuration, formatSeconds, localDay, relativeDay, WEEKDAYS } from '../lib/format';
import type { Exercise, Today, WorkoutLite } from '../lib/types';
import { useCountdown } from '../lib/timers';
import { formatEstimate } from '../../shared/estimate';
import type { Tab } from './TopBar';
import {
  Button,
  Chip,
  cx,
  EmptyState,
  Field,
  Input,
  Modal,
  Notice,
  NumberInput,
  Panel,
  SectionTitle,
  Select,
  Spinner,
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
  const [other, setOther] = useState('');
  const [checkin, setCheckin] = useState<Exercise | 'free' | null>(null);

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

      {data.active.length > 0 && (
        <div className="space-y-2">
          {data.active.map((s) => (
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
          {data.program.mode === 'weekly' ? `Programado para ${WEEKDAYS[weekday]!.toLowerCase()}` : 'Próximo da sequência'}
        </SectionTitle>

        {!hasProgram ? (
          <EmptyState
            title="Monte seu programa"
            action={<Button onClick={() => onGoTo('workouts')}>Ir para Treinos</Button>}
          >
            Cadastre seus exercícios, monte os treinos (A, B, C…) e defina se eles seguem os dias da
            semana ou uma sequência livre como A B C A B.
          </EmptyState>
        ) : data.scheduled.length === 0 ? (
          <Panel className="p-5 text-dust">
            {data.program.mode === 'weekly'
              ? 'Nada programado para hoje — dia de descanso. Se quiser, escolha um treino abaixo.'
              : 'A vez agora é de descanso na sequência.'}
            {data.program.mode === 'rotation' && (
              <Button
                variant="outline"
                size="sm"
                className="ml-3"
                onClick={() =>
                  api
                    .setRotationIndex(data.program.rotationIndex + 1)
                    .then(load)
                    .catch((e) => setError(e.message))
                }
              >
                <SkipForward className="size-4" aria-hidden /> Marcar descanso como feito
              </Button>
            )}
          </Panel>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.scheduled.map((w) => (
              <WorkoutCard
                key={w.id}
                w={w}
                doneToday={data.sessions.some((s) => s.workoutId === w.id)}
                busy={busy === w.id}
                onStart={() => start(w.id)}
              />
            ))}
          </div>
        )}

        {data.program.mode === 'rotation' && data.upcoming.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-dust">
            Depois:
            {data.upcoming.slice(1).map((u, i) => (
              <button
                key={i}
                title="Pular para este na sequência"
                onClick={() =>
                  api
                    .setRotationIndex(u.index)
                    .then(load)
                    .catch((e) => setError(e.message))
                }
                className="rounded-full border border-ridge px-2.5 py-0.5 text-xs hover:border-nebula-soft hover:text-starlight"
              >
                {u.workout ? (u.workout.code ?? u.workout.name) : 'descanso'}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Select value={other} onChange={(e) => setOther(e.target.value)} className="w-full sm:w-80">
            <option value="">Fazer outro treino…</option>
            {data.workouts.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code ? `${w.code} · ` : ''}
                {w.name}
                {w.estimatedSeconds > 0 ? ` (≈ ${formatEstimate(w.estimatedSeconds)})` : ''}
              </option>
            ))}
          </Select>
          <Button variant="outline" disabled={!other || busy != null} onClick={() => start(Number(other))}>
            Começar
          </Button>
          <Button variant="ghost" disabled={busy != null} onClick={() => start(null)}>
            <Plus className="size-4" aria-hidden /> Treino livre
          </Button>
        </div>
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
                <span className="text-sm text-dust">{formatDuration(s.durationMs)}</span>
                <Check className="size-4 text-lime" aria-hidden />
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

function WorkoutCard({
  w,
  doneToday,
  busy,
  onStart,
}: {
  w: WorkoutLite;
  doneToday: boolean;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <Panel className="aura relative overflow-hidden p-5">
      <div className="flex items-start gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-white"
          style={{ background: w.color }}
        >
          {w.code ?? w.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-medium">{w.name}</p>
          <p className="text-sm text-dust">
            {w.itemCount} {w.itemCount === 1 ? 'exercício' : 'exercícios'}
            {doneToday && <span className="text-lime"> · já feito hoje</span>}
          </p>
          {w.estimatedSeconds > 0 && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-cyan" title="30 s por série + o descanso de cada série">
              <Clock className="size-4" aria-hidden />
              Tempo estimado ≈ {formatEstimate(w.estimatedSeconds)}
            </p>
          )}
        </div>
      </div>
      {w.notes && <p className="mt-3 line-clamp-2 text-sm text-dust">{w.notes}</p>}
      <Button size="lg" className={cx('mt-4 w-full', !doneToday && 'breathe')} disabled={busy} onClick={onStart}>
        {busy ? <Spinner /> : <Play className="size-4" aria-hidden />}
        {doneToday ? 'Fazer de novo' : 'Começar treino'}
      </Button>
    </Panel>
  );
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
          <Field label={`Tempo (segundos)${exercise?.perSide ? ' por lado' : ''}`}>
            <NumberInput value={seconds} onChange={setSeconds} className="w-32" />
          </Field>
          <Button
            variant="outline"
            onClick={() => (timer.running ? timer.stop() : timer.start(seconds ?? 30))}
          >
            <Timer className="size-4" aria-hidden />
            {timer.running ? `${timer.left}s — parar` : 'Iniciar timer'}
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
