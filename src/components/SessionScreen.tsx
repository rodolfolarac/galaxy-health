import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  CircleAlert,
  ExternalLink,
  History,
  Hourglass,
  Plus,
  RotateCcw,
  SkipForward,
  Timer,
  TimerOff,
  NotebookPen,
  Trash2,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { api, type SetPatch } from '../lib/api';
import { useCatalog } from '../lib/catalog';
import {
  formatDuration,
  formatKg,
  KIND_LABEL,
  relativeDay,
  targetLabel,
} from '../lib/format';
import { alertDone, useCountdown, useLocalFlag, useStopwatch, useWakeLock } from '../lib/timers';
import type { Comparison, ExerciseKind, SessionExercise, SessionFull, SetRow } from '../lib/types';
import { ComparisonView } from './ComparisonView';
import { BandSwatch, groupSetsByLoad, LoadPicker, LoadSummary, type LoadValue } from './Load';
import { EMPTY_GROUP_FILTER, GroupFilter, matchesGroup, type GroupFilterValue } from './MuscleGroups';
import { estimateSeconds, formatEstimate, type EstimateSet } from '../../shared/estimate';
import {
  Button,
  Chip,
  cx,
  Field,
  Input,
  Modal,
  Notice,
  NumberInput,
  Segmented,
  Select,
  Spinner,
  Textarea,
  Toast,
} from './ui';

type SaveState = 'idle' | 'saving' | 'error';

export function SessionScreen({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const [full, setFull] = useState<SessionFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>('idle');
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'record' } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [adding, setAdding] = useState(false);
  const pending = useRef(0);
  /** Descanso automático ao marcar a série. Desligue se prefere controlar sem timer. */
  const [autoRest, setAutoRest] = useLocalFlag('gh:autoRest', true);
  /** O que o timer está contando agora: descanso ou execução de uma série por tempo. */
  const [timerInfo, setTimerInfo] = useState<
    { kind: 'rest'; label: string } | { kind: 'work'; label: string; seId: number; setId: number; secs: number } | null
  >(null);
  const timerInfoRef = useRef(timerInfo);
  timerInfoRef.current = timerInfo;
  const fullRef = useRef<SessionFull | null>(null);
  const timer = useCountdown(() => {
    const info = timerInfoRef.current;
    alertDone(info?.kind ?? 'rest');
    setTimerInfo(null);
    if (info?.kind !== 'work') return;
    // Fim da isometria: a série é registrada com o tempo feito e o descanso começa.
    const se = fullRef.current?.exercises.find((x) => x.id === info.seId);
    const set = se?.sets.find((x) => x.id === info.setId);
    if (se && set && !set.done) {
      void saveSet(se, set, { seconds: set.seconds ?? info.secs, done: true }).then(() => startRest(se, set));
    }
  });

  useEffect(() => {
    api
      .session(sessionId)
      .then(setFull)
      .catch((e) => setError(e.message));
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sessionId]);

  /** Envolve toda gravação: mostra "salvando…" e erro com o que falhou. */
  const persist = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    pending.current++;
    setSave('saving');
    try {
      const r = await fn();
      pending.current--;
      if (pending.current === 0) setSave('idle');
      return r;
    } catch (e) {
      pending.current--;
      setSave('error');
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
      return null;
    }
  }, []);

  const active = full?.session.status === 'active';
  fullRef.current = full;
  useWakeLock(!!active);
  const timing = sessionTiming(full);
  const elapsed = useStopwatch(full?.session.durationMs ?? 0);
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;

  // O cronômetro vai para o banco a cada 15 s — fechar o app não perde o tempo.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      api.updateSession(sessionId, { durationMs: elapsedRef.current }).catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [active, sessionId]);

  const patchSe = (seId: number, fn: (se: SessionExercise) => SessionExercise) =>
    setFull((f) => f && { ...f, exercises: f.exercises.map((se) => (se.id === seId ? fn(se) : se)) });

  const patchSetLocal = (seId: number, setId: number, patch: Partial<SetRow>) =>
    patchSe(seId, (se) => ({ ...se, sets: se.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }));

  async function saveSet(se: SessionExercise, set: SetRow, patch: SetPatch) {
    patchSetLocal(se.id, set.id, patch as Partial<SetRow>);
    const r = await persist(() => api.updateSet(set.id, patch));
    if (!r) return;
    patchSetLocal(se.id, set.id, { loadKg: r.set.loadKg, completedAt: r.set.completedAt });
    if (r.set.done && se.status === 'pending') patchSe(se.id, (x) => ({ ...x, status: 'done' }));
    if (r.record === 'load') {
      setToast({ text: `Maior carga que você já usou em ${se.exercise.name}!`, tone: 'record' });
    } else if (r.record === 'reps') {
      setToast({ text: `Recorde de ${se.exercise.measure === 'time' ? 'tempo' : 'repetições'} com essa carga em ${se.exercise.name}!`, tone: 'record' });
    }
  }

  async function toggleDone(se: SessionExercise, set: SetRow) {
    const done = !set.done;
    const patch: SetPatch = { done };
    // ✓ sem número digitado: assume a meta (ou o que fez da última vez).
    if (done) {
      const prev = se.previous?.sets[set.position];
      if (se.exercise.measure === 'time' && set.seconds == null) {
        patch.seconds = se.targetSeconds ?? prev?.seconds ?? se.exercise.defaultSeconds ?? null;
      }
      if (se.exercise.measure === 'reps' && set.reps == null) {
        patch.reps = prev?.reps ?? se.targetReps ?? se.exercise.defaultReps ?? null;
      }
    }
    await saveSet(se, set, patch);
    if (done) startRest(se, set);
  }

  /** Registro pelo botão "Registrar série": salva tudo e, se acabou de ficar feita, começa o descanso. */
  async function registerSet(se: SessionExercise, set: SetRow, patch: SetPatch) {
    const wasDone = set.done;
    await saveSet(se, set, patch);
    if (patch.done && !wasDone) startRest(se, set);
  }

  function startRest(se: SessionExercise, set: SetRow) {
    if (!active || !autoRest) return;
    const secs = set.restSeconds ?? se.restSeconds ?? se.exercise.restSeconds;
    if (secs <= 0) return;
    const isLast = set.position === se.sets.length - 1;
    setTimerInfo({ kind: 'rest', label: isLast ? 'Descanso · próximo exercício' : `Descanso · depois vem a série ${set.position + 2}` });
    timer.start(secs);
  }

  function startWork(se: SessionExercise, set: SetRow, secs: number) {
    setTimerInfo({ kind: 'work', label: `${se.exercise.name} · série ${set.position + 1}`, seId: se.id, setId: set.id, secs });
    timer.start(secs);
  }

  async function applyLoad(se: SessionExercise, set: SetRow, v: LoadValue, scope: 'one' | 'rest') {
    const targets = scope === 'one' ? [set] : se.sets.filter((s) => s.position >= set.position);
    for (const t of targets) {
      await saveSet(se, t, { bandIds: v.bandIds, setup: v.setup, adjustPct: v.adjustPct, weightKg: v.weightKg });
    }
  }

  async function addSet(se: SessionExercise) {
    const row = await persist(() => api.addSet(se.id));
    if (row) patchSe(se.id, (x) => ({ ...x, sets: [...x.sets, row] }));
  }

  async function removeSet(se: SessionExercise, set: SetRow) {
    patchSe(se.id, (x) => ({ ...x, sets: x.sets.filter((s) => s.id !== set.id) }));
    await persist(() => api.deleteSet(set.id));
  }

  async function setSeField(se: SessionExercise, body: { notes?: string | null; status?: 'pending' | 'done' | 'skipped' }) {
    patchSe(se.id, (x) => ({ ...x, ...body }));
    await persist(() => api.updateSessionExercise(se.id, body));
  }

  async function removeExercise(se: SessionExercise) {
    if (!confirm(`Tirar ${se.exercise.name} deste treino? As séries dele nesta sessão serão apagadas.`)) return;
    setFull((f) => f && { ...f, exercises: f.exercises.filter((x) => x.id !== se.id) });
    await persist(() => api.deleteSessionExercise(se.id));
  }

  async function finish(status: 'completed' | 'aborted', extra: { notes: string | null; rpe: number | null; energy: number | null; pain: string | null }) {
    const s1 = await persist(() => api.updateSession(sessionId, { ...extra, durationMs: elapsedRef.current }));
    if (!s1) return;
    const s2 = await persist(() => api.finishSession(sessionId, status, active ? elapsedRef.current : full!.session.durationMs));
    if (!s2) return;
    setFinishing(false);
    timer.stop();
    setTimerInfo(null);
    if (status === 'aborted') return onClose();
    const [fresh, cmp] = await Promise.all([api.session(sessionId), api.compare(sessionId)]);
    setFull(fresh);
    setComparison(cmp);
  }

  async function reopen() {
    const r = await persist(() => api.reopenSession(sessionId));
    if (r) {
      setFull(r);
      setComparison(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-void/92 backdrop-blur-2xl">
      {/* Cabeçalho fixo */}
      <header className="border-b border-ridge bg-void/70">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            onClick={onClose}
            aria-label="Voltar (o treino continua salvo)"
            title="Voltar — o treino continua salvo"
            className="rounded-lg p-2 text-dust hover:bg-white/6 hover:text-starlight"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{full?.session.name ?? 'Carregando…'}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-dust">
              {full && (active ? <span className="tabular-nums">{formatDuration(elapsed)}</span> : <span>{relativeDay(full.session.day)} · {formatDuration(full.session.durationMs)}</span>)}
              {full && timing.total > 0 && (
                <span className="inline-flex items-center gap-1 text-faint" title="30 s por série + o descanso de cada série">
                  <Clock className="size-3" aria-hidden />≈ {formatEstimate(timing.total)}
                  {active && timing.remaining > 0 && timing.remaining < timing.total && ` · faltam ~${formatEstimate(timing.remaining)}`}
                </span>
              )}
              {save === 'saving' && <span className="text-faint">salvando…</span>}
              {save === 'error' && <span className="text-rose-300">não salvou</span>}
              {save === 'idle' && full && <span className="text-faint">salvo</span>}
            </p>
          </div>
          {full && active && (
            <button
              onClick={() => {
                setAutoRest(!autoRest);
                setToast({ text: autoRest ? 'Descanso automático desligado.' : 'Descanso automático ligado.', tone: 'info' });
              }}
              aria-pressed={autoRest}
              aria-label={autoRest ? 'Desligar descanso automático' : 'Ligar descanso automático'}
              title={autoRest ? 'Descanso automático ligado' : 'Descanso automático desligado'}
              className={cx('rounded-lg p-2 transition-colors', autoRest ? 'text-cyan hover:bg-white/6' : 'text-faint hover:bg-white/6')}
            >
              {autoRest ? <Timer className="size-5" aria-hidden /> : <TimerOff className="size-5" aria-hidden />}
            </button>
          )}
          {full && active && (
            <Button size="sm" onClick={() => setFinishing(true)}>
              <Check className="size-4" aria-hidden /> Encerrar
            </Button>
          )}
          {full && !active && !comparison && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => api.compare(sessionId).then(setComparison).catch((e) => setError(e.message))}
            >
              <History className="size-4" aria-hidden /> Comparar
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-5 pb-40">
          {error && (
            <div className="mb-4">
              <Notice>
                {error}{' '}
                <button className="underline" onClick={() => setError(null)}>
                  ok
                </button>
              </Notice>
            </div>
          )}

          {!full ? (
            <div className="flex justify-center py-20">
              <Spinner className="size-6" />
            </div>
          ) : comparison ? (
            <div className="space-y-5">
              <ComparisonView data={comparison} />
              <div className="flex flex-wrap gap-2">
                <Button onClick={onClose}>Fechar</Button>
                <Button variant="outline" onClick={() => setComparison(null)}>
                  Ver séries
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!active && (
                <Notice tone="info">
                  Treino {full.session.status === 'completed' ? 'concluído' : 'interrompido'}. Você ainda pode corrigir
                  séries e observações aqui.{' '}
                  <button onClick={reopen} className="inline-flex items-center gap-1 underline">
                    <RotateCcw className="size-3" aria-hidden /> Reabrir treino
                  </button>
                </Notice>
              )}

              {full.exercises.length === 0 && (
                <p className="py-6 text-center text-dust">Nenhum exercício ainda. Adicione abaixo.</p>
              )}

              {full.exercises.map((se, i) => (
                <ExerciseCard
                  key={se.id}
                  index={i}
                  se={se}
                  onToggleDone={(set) => toggleDone(se, set)}
                  onSaveSet={(set, patch) => saveSet(se, set, patch)}
                  onLocalSet={(set, patch) => patchSetLocal(se.id, set.id, patch)}
                  onApplyLoad={(set, v, scope) => applyLoad(se, set, v, scope)}
                  onAddSet={() => addSet(se)}
                  onRemoveSet={(set) => removeSet(se, set)}
                  onNotes={(notes) => setSeField(se, { notes })}
                  onSkip={() => setSeField(se, { status: se.status === 'skipped' ? 'pending' : 'skipped' })}
                  onRemove={() => removeExercise(se)}
                  onWork={(set, secs) => startWork(se, set, secs)}
                  onRegister={(set, patch) => registerSet(se, set, patch)}
                />
              ))}

              <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
                <Plus className="size-4" aria-hidden /> Adicionar exercício
              </Button>

              {!active && (
                <SessionNotes
                  full={full}
                  onSave={(body) =>
                    persist(() => api.updateSession(sessionId, body)).then(
                      (s) => s && setFull((f) => f && { ...f, session: s }),
                    )
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Timer: descanso entre séries (ciano) ou execução de série por tempo (âmbar) */}
      {timer.running && (
        <div
          className={cx(
            'safe-bottom fixed inset-x-0 bottom-0 z-50 border-t bg-deep/95 pt-3 backdrop-blur-xl',
            timerInfo?.kind === 'work' ? 'border-amber/40' : 'border-cyan/30',
          )}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4">
            {timerInfo?.kind === 'work' ? (
              <Hourglass className="size-5 text-amber" aria-hidden />
            ) : (
              <Timer className="size-5 text-cyan" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-dust">{timerInfo?.label ?? 'Descanso'}</p>
              <p className="text-2xl font-semibold tabular-nums">{formatDuration(timer.left * 1000)}</p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cx('h-full rounded-full transition-[width] duration-300', timerInfo?.kind === 'work' ? 'bg-amber' : 'bg-cyan')}
                  style={{ width: `${timer.total ? (timer.left / timer.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => timer.add(15)}>
              +15s
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                timer.stop();
                setTimerInfo(null);
              }}
            >
              {timerInfo?.kind === 'work' ? 'Parar' : 'Pronto'}
            </Button>
          </div>
        </div>
      )}

      {toast && (
        <Toast tone={toast.tone} onDone={() => setToast(null)}>
          <span className="flex items-center gap-2">
            {toast.tone === 'record' && <Trophy className="size-4" aria-hidden />} {toast.text}
          </span>
        </Toast>
      )}

      {finishing && full && (
        <FinishModal full={full} onClose={() => setFinishing(false)} onFinish={finish} />
      )}

      {adding && full && (
        <AddExerciseModal
          exclude={full.exercises.map((e) => e.exerciseId)}
          onClose={() => setAdding(false)}
          onPick={async (exerciseId) => {
            setAdding(false);
            const r = await persist(() => api.addSessionExercise(sessionId, exerciseId));
            if (r) setFull(r);
          }}
        />
      )}
    </div>
  );
}

// ── Exercício ─────────────────────────────────────────────────

function ExerciseCard({
  index,
  se,
  onToggleDone,
  onSaveSet,
  onLocalSet,
  onApplyLoad,
  onAddSet,
  onRemoveSet,
  onNotes,
  onSkip,
  onRemove,
  onWork,
  onRegister,
}: {
  index: number;
  se: SessionExercise;
  onToggleDone: (set: SetRow) => void;
  onSaveSet: (set: SetRow, patch: SetPatch) => void;
  onLocalSet: (set: SetRow, patch: Partial<SetRow>) => void;
  onApplyLoad: (set: SetRow, v: LoadValue, scope: 'one' | 'rest') => void;
  onAddSet: () => void;
  onRemoveSet: (set: SetRow) => void;
  onNotes: (notes: string | null) => void;
  onSkip: () => void;
  onRemove: () => void;
  onWork: (set: SetRow, secs: number) => void;
  onRegister: (set: SetRow, patch: SetPatch) => void;
}) {
  const { groupLabel } = useCatalog();
  const ex = se.exercise;
  const [open, setOpen] = useState(se.status !== 'skipped');
  const [showInfo, setShowInfo] = useState(false);
  const [picker, setPicker] = useState<SetRow | null>(null);
  const [notes, setNotes] = useState(se.notes ?? '');
  const doneCount = se.sets.filter((s) => s.done).length;
  const skipped = se.status === 'skipped';
  const usesLoad = ex.equipment !== 'bodyweight' || se.sets.some((s) => s.bandIds.length || s.weightKg);

  return (
    <section className={cx('glass rounded-2xl', skipped && 'opacity-60')}>
      <button
        className="flex w-full items-start gap-3 p-4 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span
          className={cx(
            'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
            doneCount >= (se.targetSets ?? 1) ? 'bg-lime/20 text-lime' : 'bg-white/8 text-dust',
          )}
        >
          {doneCount >= (se.targetSets ?? 1) ? <Check className="size-4" aria-hidden /> : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-lg leading-snug font-medium">{ex.name}</span>
            {se.supersetGroup && <Chip className="border-magenta/50 text-magenta">bi-set {se.supersetGroup}</Chip>}
            {skipped && <Chip className="border-amber/40 text-amber">pulado</Chip>}
          </span>
          <span className="mt-0.5 block text-sm text-dust">
            {targetLabel({ ...se, measure: ex.measure, perSide: ex.perSide })} · {KIND_LABEL[ex.kind as ExerciseKind]}
            {groupLabel(ex.muscleGroupId) && ` · ${groupLabel(ex.muscleGroupId)}`} · {doneCount}/{se.sets.length} séries
          </span>
        </span>
        <ChevronDown className={cx('mt-1 size-5 shrink-0 text-faint transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          {/* Última vez — em destaque: carga, setup e reps de cada série */}
          <LastTime se={se} />

          {se.suggestion && (
            <p
              className={cx(
                'flex items-start gap-2 rounded-xl border px-3 py-2 text-sm',
                se.suggestion.level === 'up' ? 'border-amber/40 bg-amber/10 text-amber' : 'border-cyan/25 bg-cyan/5 text-cyan',
              )}
            >
              <TrendingUp className="mt-0.5 size-4 shrink-0" aria-hidden />
              {se.suggestion.text}
            </p>
          )}

          {(ex.instructions || ex.notes || ex.videos.length > 0) && (
            <div>
              <button onClick={() => setShowInfo((s) => !s)} className="text-sm text-nebula-soft hover:underline">
                {showInfo ? 'Esconder' : 'Como fazer'} {ex.videos.length > 0 && `· ${ex.videos.length} vídeo${ex.videos.length > 1 ? 's' : ''}`}
              </button>
              {showInfo && (
                <div className="mt-2 space-y-2 rounded-xl bg-black/20 p-3 text-sm leading-relaxed text-dust">
                  {ex.instructions && <p className="whitespace-pre-line">{ex.instructions}</p>}
                  {ex.notes && <p className="whitespace-pre-line text-starlight/85">{ex.notes}</p>}
                  {ex.videos.map((v, i) => (
                    <a
                      key={i}
                      href={v.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-cyan hover:underline"
                    >
                      <ExternalLink className="size-4" aria-hidden />
                      {v.label || v.url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Séries */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1.75rem_1fr_3rem_4.5rem_2.75rem] gap-2 px-1 text-[11px] tracking-wide text-faint uppercase">
              <span>#</span>
              <span>{usesLoad ? 'Carga' : ''}</span>
              <span className="text-center">Antes</span>
              <span className="text-center">{ex.measure === 'time' ? 'Seg' : 'Reps'}</span>
              <span />
            </div>
            {se.sets.map((set) => (
              <SetRowView
                key={set.id}
                se={se}
                set={set}
                usesLoad={usesLoad}
                onPickLoad={() => setPicker(set)}
                onToggleDone={() => onToggleDone(set)}
                onLocal={(p) => onLocalSet(set, p)}
                onSave={(p) => onSaveSet(set, p)}
                onRemove={() => onRemoveSet(set)}
                onWork={(secs) => onWork(set, secs)}
                onRegister={(p) => onRegister(set, p)}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={onAddSet}>
              <Plus className="size-4" aria-hidden /> Série
            </Button>
            <Button variant="ghost" size="sm" onClick={onSkip}>
              <SkipForward className="size-4" aria-hidden /> {skipped ? 'Desfazer pulo' : 'Pular exercício'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onRemove} className="ml-auto text-faint">
              <Trash2 className="size-4" aria-hidden />
              <span className="sr-only">Remover exercício</span>
            </Button>
          </div>

          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (se.notes ?? '') && onNotes(notes.trim() || null)}
            placeholder="Observação de hoje sobre este exercício (ex.: com amarra dupla consegui 8, sem amarra 14)"
            className="text-sm"
          />
        </div>
      )}

      {picker && (
        <LoadPicker
          initial={{ bandIds: picker.bandIds, setup: picker.setup, adjustPct: picker.adjustPct, weightKg: picker.weightKg }}
          exerciseId={ex.id}
          title={`Carga · série ${picker.position + 1}`}
          allowApplyRest={se.sets.some((s) => s.position > picker.position)}
          onClose={() => setPicker(null)}
          onApply={(v, scope) => {
            onApplyLoad(picker, v, scope);
            setPicker(null);
          }}
        />
      )}
    </section>
  );
}

function LastTime({ se }: { se: SessionExercise }) {
  const p = se.previous;
  if (!p) {
    return (
      <p className="rounded-xl border border-dashed border-ridge px-3 py-2 text-sm text-faint">
        Primeira vez registrando este exercício.
      </p>
    );
  }
  const groups = groupSetsByLoad(p.sets, se.exercise.measure);

  return (
    <div className="rounded-xl border border-nebula-soft/30 bg-nebula/10 px-3 py-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium tracking-wide text-nebula-soft uppercase">
        <History className="size-3.5" aria-hidden /> Última vez · {relativeDay(p.day)}
        {p.sessionName && <span className="normal-case text-faint">({p.sessionName})</span>}
      </p>
      <div className="space-y-1">
        {groups.map((g, i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <LoadSummary value={g.set} loadKg={g.set.loadKg} showEmpty={se.exercise.equipment !== 'bodyweight'} />
            <span className="font-semibold tabular-nums text-starlight">{g.values.join(' · ')}</span>
          </div>
        ))}
      </div>
      {/* Série a série, com o que foi anotado: "S1 · 12 reps — consegui 12 cansando pouco". */}
      {p.sets.some((s) => s.notes) && (
        <ol className="mt-2 space-y-1 border-t border-nebula-soft/20 pt-2 text-sm">
          {p.sets.map((s) => (
            <li key={s.id} className="flex gap-2">
              <span className="w-7 shrink-0 text-xs leading-5 text-faint">S{s.position + 1}</span>
              <span className="w-14 shrink-0 font-semibold tabular-nums text-starlight">
                {se.exercise.measure === 'time' ? `${s.seconds ?? '—'}s` : `${s.reps ?? '—'} reps`}
              </span>
              {s.notes ? <span className="text-dust italic">“{s.notes}”</span> : <span className="text-faint">—</span>}
            </li>
          ))}
        </ol>
      )}
      {p.notes && <p className="mt-1.5 text-sm text-dust italic">“{p.notes}”</p>}
    </div>
  );
}

function SetRowView({
  se,
  set,
  usesLoad,
  onPickLoad,
  onToggleDone,
  onLocal,
  onSave,
  onRegister,
  onRemove,
  onWork,
}: {
  se: SessionExercise;
  set: SetRow;
  usesLoad: boolean;
  onPickLoad: () => void;
  onToggleDone: () => void;
  onLocal: (p: Partial<SetRow>) => void;
  onSave: (p: SetPatch) => void;
  /** Registro pelo botão: reps/tempo + observação, já marcando a série como feita. */
  onRegister: (p: SetPatch) => void;
  onRemove: () => void;
  /** Inicia o timer de execução (exercícios por tempo). */
  onWork: (secs: number) => void;
}) {
  const { bandById } = useCatalog();
  const [logging, setLogging] = useState(false);
  const isTime = se.exercise.measure === 'time';
  const prev = se.previous?.sets[set.position];
  const prevVal = prev ? (isTime ? prev.seconds : prev.reps) : null;
  const value = isTime ? set.seconds : set.reps;
  const placeholder = String(prevVal ?? (isTime ? (se.targetSeconds ?? '') : (se.targetReps ?? '')));
  const bands = set.bandIds.map((id) => bandById.get(id)).filter((b) => !!b);

  return (
    <div className={cx('rounded-xl transition-colors', set.done ? 'bg-lime/8' : 'bg-black/15')}>
      <div className="grid grid-cols-[1.75rem_1fr_3rem_4.5rem_2.75rem] items-center gap-2 px-1 py-1.5">
        <span className="text-center text-sm text-dust tabular-nums">{set.position + 1}</span>

        {usesLoad ? (
          <button
            onClick={onPickLoad}
            className="flex min-h-10 min-w-0 flex-col justify-center rounded-lg border border-ridge px-2 py-1 text-left hover:border-nebula-soft/60"
            title="Trocar elástico / ajuste da carga"
          >
            <span className="flex items-center gap-1">
              {bands.length ? (
                bands.map((b) => <BandSwatch key={b.id} color={b.color} className="size-3.5" />)
              ) : !set.weightKg ? (
                <span className="text-xs text-faint">escolher</span>
              ) : null}
              {!!set.weightKg && <span className="text-xs text-starlight">{set.weightKg}kg</span>}
              {set.loadKg != null && <span className="text-[11px] text-faint">≈{formatKg(set.loadKg)}</span>}
            </span>
            {set.setup && <span className="line-clamp-2 text-[11px] leading-tight text-cyan">{set.setup}</span>}
          </button>
        ) : (
          <span className="text-xs text-faint">peso do corpo</span>
        )}

        <span className="text-center text-sm text-faint tabular-nums" title={prev ? 'Última vez' : undefined}>
          {prevVal ?? '—'}
        </span>

        <div className="relative">
          <NumberInput
            value={value}
            onChange={(n) => onLocal(isTime ? { seconds: n } : { reps: n })}
            onBlur={() => onSave(isTime ? { seconds: value } : { reps: value })}
            placeholder={placeholder}
            aria-label={isTime ? 'Segundos' : 'Repetições'}
            className="px-2 py-2 text-center text-lg font-semibold tabular-nums"
          />
        </div>

        <button
          onClick={onToggleDone}
          aria-label={set.done ? 'Desmarcar série' : 'Marcar série como feita'}
          aria-pressed={set.done}
          className={cx(
            'flex size-11 items-center justify-center rounded-xl border transition-colors',
            set.done ? 'border-lime/60 bg-lime/25 text-lime' : 'border-ridge text-faint hover:border-lime/50 hover:text-lime',
          )}
        >
          <Check className="size-5" aria-hidden />
        </button>
      </div>

      {/* Observação da série, sempre visível depois de escrita. Toque para editar. */}
      {set.notes && (
        <button onClick={() => setLogging(true)} className="block w-full px-3 pb-1 text-left text-sm text-starlight/90 italic hover:text-starlight">
          “{set.notes}”
        </button>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-1.5 text-xs">
        <button
          onClick={() => setLogging(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-nebula-soft/40 px-2 py-1 text-nebula-soft hover:bg-nebula/15"
        >
          <NotebookPen className="size-3.5" aria-hidden /> {set.done || set.notes ? 'Editar registro' : 'Registrar série'}
        </button>
        <RestEdit
          value={set.restSeconds ?? se.restSeconds ?? se.exercise.restSeconds}
          onSave={(n) => onSave({ restSeconds: n })}
        />
        {isTime && (
          <button
            onClick={() => onWork(set.seconds ?? se.targetSeconds ?? se.exercise.defaultSeconds ?? 30)}
            className="inline-flex items-center gap-1 text-faint hover:text-cyan"
          >
            <Timer className="size-3.5" aria-hidden /> iniciar timer
          </button>
        )}
      </div>

      {logging && (
        <SetLogModal
          se={se}
          set={set}
          onClose={() => setLogging(false)}
          onSave={(p) => {
            setLogging(false);
            onRegister(p);
          }}
          onRemove={() => {
            setLogging(false);
            onRemove();
          }}
        />
      )}
    </div>
  );
}

/**
 * Registrar uma série sem depender de timer: quanto fez e como foi
 * ("consegui 12 cansando pouco"), com o que fez da última vez ao lado.
 */
function SetLogModal({
  se,
  set,
  onClose,
  onSave,
  onRemove,
}: {
  se: SessionExercise;
  set: SetRow;
  onClose: () => void;
  onSave: (p: SetPatch) => void;
  onRemove: () => void;
}) {
  const isTime = se.exercise.measure === 'time';
  const prev = se.previous?.sets[set.position];
  const prevVal = prev ? (isTime ? prev.seconds : prev.reps) : null;
  const [value, setValue] = useState<number | null>(isTime ? set.seconds : set.reps);
  const [note, setNote] = useState(set.notes ?? '');
  const unit = isTime ? 's' : ' reps';

  return (
    <Modal
      title={`${se.exercise.name} · série ${set.position + 1}`}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2 pb-1">
          <Button variant="ghost" onClick={onRemove} className="text-faint">
            <Trash2 className="size-4" aria-hidden /> Apagar série
          </Button>
          <Button
            className="ml-auto"
            onClick={() =>
              onSave({ ...(isTime ? { seconds: value } : { reps: value }), notes: note.trim() || null, done: true })
            }
          >
            <Check className="size-4" aria-hidden /> Salvar série
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-nebula-soft/30 bg-nebula/10 px-3 py-2.5 text-sm">
          <p className="mb-1 text-xs font-medium tracking-wide text-nebula-soft uppercase">
            Última vez{se.previous ? ` · ${relativeDay(se.previous.day)}` : ''}
          </p>
          {prev ? (
            <>
              <p className="text-lg font-semibold tabular-nums">
                {prevVal ?? '—'}
                {prevVal != null && unit}
              </p>
              {prev.notes ? <p className="text-dust italic">“{prev.notes}”</p> : <p className="text-faint">Sem observação.</p>}
            </>
          ) : (
            <p className="text-faint">Sem registro desta série ainda.</p>
          )}
        </div>

        <Field label={isTime ? 'Quanto tempo segurou (segundos)' : 'Quantas repetições fez'}>
          <NumberInput
            autoFocus
            value={value}
            onChange={setValue}
            placeholder={String(prevVal ?? (isTime ? (se.targetSeconds ?? '') : (se.targetReps ?? '')))}
            className="text-center text-2xl font-semibold tabular-nums"
          />
        </Field>

        <Field label="Como foi">
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex.: consegui fazer 12 cansando pouco"
          />
        </Field>
      </div>
    </Modal>
  );
}

// ── Encerrar ──────────────────────────────────────────────────

function FinishModal({
  full,
  onClose,
  onFinish,
}: {
  full: SessionFull;
  onClose: () => void;
  onFinish: (
    status: 'completed' | 'aborted',
    extra: { notes: string | null; rpe: number | null; energy: number | null; pain: string | null },
  ) => void;
}) {
  const s = full.session;
  const [notes, setNotes] = useState(s.notes ?? '');
  const [rpe, setRpe] = useState<number | null>(s.rpe);
  const [energy, setEnergy] = useState<number | null>(s.energy);
  const [pain, setPain] = useState(s.pain ?? '');
  const [busy, setBusy] = useState(false);

  const willSkip = full.exercises.filter(
    (e) => e.status !== 'skipped' && !e.sets.some((x) => x.done || x.reps != null || x.seconds != null),
  );
  const extra = () => ({ notes: notes.trim() || null, rpe, energy, pain: pain.trim() || null });

  return (
    <Modal
      title="Encerrar treino"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2 pb-1">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (!confirm('Interromper? O que já foi feito fica salvo, mas o treino não conta como concluído.')) return;
              setBusy(true);
              onFinish('aborted', extra());
            }}
          >
            Interromper
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onFinish('completed', extra());
            }}
          >
            {busy ? <Spinner /> : <Check className="size-4" aria-hidden />} Concluir
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {willSkip.length > 0 && (
          <p className="flex gap-2 rounded-xl border border-amber/35 bg-amber/10 px-3 py-2 text-sm text-amber">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Sem nenhuma série: {willSkip.map((e) => e.exercise.name).join(', ')}. Vão ficar marcados como{' '}
              <strong>pulados</strong> no comparativo.
            </span>
          </p>
        )}
        <Field group label="Esforço percebido (1 = leve, 10 = máximo)">
          <Segmented
            value={String(rpe ?? '')}
            onChange={(v) => setRpe(Number(v))}
            options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
          />
        </Field>
        <Field group label="Energia / disposição">
          <Segmented
            value={String(energy ?? '')}
            onChange={(v) => setEnergy(Number(v))}
            options={[
              { value: '1', label: 'péssima' },
              { value: '2', label: 'baixa' },
              { value: '3', label: 'ok' },
              { value: '4', label: 'boa' },
              { value: '5', label: 'ótima' },
            ]}
          />
        </Field>
        <Field label="Dor ou desconforto">
          <Input value={pain} onChange={(e) => setPain(e.target.value)} placeholder="Ex.: ombro direito no final do supino" />
        </Field>
        <Field label="Observação geral do treino">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Como foi o treino hoje" />
        </Field>
      </div>
    </Modal>
  );
}

function SessionNotes({
  full,
  onSave,
}: {
  full: SessionFull;
  onSave: (body: { notes?: string | null; pain?: string | null }) => void;
}) {
  const [notes, setNotes] = useState(full.session.notes ?? '');
  return (
    <div className="glass space-y-2 rounded-2xl p-4">
      <p className="text-sm text-dust">
        Observação geral
        {full.session.rpe && <span className="ml-2 text-faint">esforço {full.session.rpe}/10</span>}
        {full.session.energy && <span className="ml-2 text-faint">energia {full.session.energy}/5</span>}
      </p>
      <Textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== (full.session.notes ?? '') && onSave({ notes: notes.trim() || null })}
      />
      {full.session.pain && <p className="text-sm text-amber">Dor: {full.session.pain}</p>}
    </div>
  );
}

function AddExerciseModal({
  exclude,
  onClose,
  onPick,
}: {
  exclude: number[];
  onClose: () => void;
  onPick: (id: number) => void;
}) {
  const { exercises, groupById } = useCatalog();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [group, setGroup] = useState<GroupFilterValue>(EMPTY_GROUP_FILTER);
  const list = exercises.filter(
    (e) =>
      !e.archived &&
      !exclude.includes(e.id) &&
      (!kind || e.kind === kind) &&
      matchesGroup(e, group, groupById) &&
      e.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <Modal title="Adicionar exercício" onClose={onClose}>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" autoFocus className="mb-2" />
      <div className="mb-3 flex flex-wrap gap-2">
        <GroupFilter value={group} onChange={setGroup} className="contents" />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-40" aria-label="Tipo">
          <option value="">Todos</option>
          {Object.entries(KIND_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        {list.map((e) => (
          <button
            key={e.id}
            onClick={() => onPick(e.id)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/6"
          >
            <span className="flex-1">{e.name}</span>
            <span className="text-xs text-faint">{KIND_LABEL[e.kind as ExerciseKind]}</span>
          </button>
        ))}
        {!list.length && <p className="py-4 text-center text-sm text-faint">Nenhum exercício encontrado.</p>}
      </div>
    </Modal>
  );
}


/**
 * Tempo estimado da sessão (30 s por série + descanso) e quanto falta,
 * contando só as séries ainda não feitas dos exercícios não pulados.
 */
function sessionTiming(full: SessionFull | null) {
  if (!full) return { total: 0, remaining: 0 };
  const all: (EstimateSet & { done: boolean })[] = [];
  for (const se of full.exercises) {
    if (se.status === 'skipped') continue;
    for (const s of se.sets) {
      all.push({
        measure: se.exercise.measure,
        perSide: se.exercise.perSide,
        seconds: s.seconds ?? se.targetSeconds ?? se.exercise.defaultSeconds,
        rest: s.restSeconds ?? se.restSeconds ?? se.exercise.restSeconds,
        done: s.done,
      });
    }
  }
  return { total: estimateSeconds(all), remaining: estimateSeconds(all.filter((s) => !s.done)) };
}

/** Descanso desta série: toque para editar. */
function RestEdit({ value, onSave }: { value: number; onSave: (n: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<number | null>(value);
  if (!editing) {
    return (
      <button
        onClick={() => {
          setV(value);
          setEditing(true);
        }}
        title="Descanso depois desta série"
        className="inline-flex items-center gap-1 text-faint hover:text-cyan"
      >
        <Hourglass className="size-3.5" aria-hidden /> {value}s
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    if (v !== value) onSave(v);
  };
  return (
    <span className="inline-flex items-center gap-1 text-faint">
      <Hourglass className="size-3.5" aria-hidden />
      <NumberInput
        autoFocus
        value={v}
        onChange={setV}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        aria-label="Descanso em segundos"
        className="w-14 px-1.5 py-0.5 text-center text-xs"
      />
      s
    </span>
  );
}
