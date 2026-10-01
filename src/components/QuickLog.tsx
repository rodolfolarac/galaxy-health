import { useEffect, useRef, useState } from 'react';
import { Check, History, Timer, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { formatSeconds, relativeDay, relativeTime } from '../lib/format';
import { alertDone, useCountdown, useWakeLock } from '../lib/timers';
import type { QuickContext } from '../lib/types';
import { Button, cx, Field, Modal, Notice, NumberInput, Spinner, Textarea } from './ui';

/**
 * Registra UMA série de um exercício do treino, sem abrir o treino inteiro.
 * Mostra o que já foi feito hoje e o que foi feito da última vez (com as
 * observações), e tem um timer opcional que registra sozinho ao terminar.
 */
export function QuickLogModal({
  workoutId,
  exerciseId,
  day,
  onClose,
  onLogged,
}: {
  workoutId: number;
  exerciseId: number;
  day: string;
  onClose: () => void;
  /** Depois de registrar: texto para o aviso e se foi recorde. */
  onLogged: (info: { text: string; record: boolean }) => void;
}) {
  const [ctx, setCtx] = useState<QuickContext | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valueRef = useRef<number | null>(null);
  valueRef.current = value;

  const load = () =>
    api
      .quickContext(workoutId, exerciseId, day)
      .then((c) => {
        setCtx(c);
        const isTime = c.exercise.measure === 'time';
        setValue((v) => v ?? (isTime ? c.target.seconds : c.target.reps));
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId, exerciseId, day]);

  const isTime = ctx?.exercise.measure === 'time';
  const nextNumber = (ctx?.today.length ?? 0) + 1;

  async function save(v = value) {
    if (!ctx) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.quickLog({
        workoutId,
        exerciseId,
        day,
        ...(isTime ? { seconds: v } : { reps: v }),
        notes: note.trim() || null,
      });
      const extra = r.done > r.target ? ' (além do previsto)' : '';
      onLogged({
        text: r.record
          ? `Recorde em ${ctx.exercise.name}! Série ${r.done} registrada.`
          : `${ctx.exercise.name}: série ${r.done} de ${r.target} registrada${extra}.`,
        record: !!r.record,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar.');
      setBusy(false);
    }
  }

  // Timer de execução: bipa 3-2-1, toca o fim e registra a série sozinho.
  const timer = useCountdown(() => {
    alertDone('work');
    void save(valueRef.current);
  });
  useWakeLock(timer.running);

  async function removeToday(id: number) {
    if (!confirm('Apagar esta série de hoje?')) return;
    await api.deleteSet(id);
    await load();
  }

  const fmt = (s: { reps: number | null; seconds: number | null }) =>
    isTime ? formatSeconds(s.seconds ?? 0) : `${s.reps ?? '—'} reps`;

  return (
    <Modal
      title={ctx ? ctx.exercise.name : 'Registrar série'}
      onClose={() => {
        timer.stop();
        onClose();
      }}
      footer={
        ctx && (
          <div className="flex items-center gap-2 pb-1">
            {isTime && (
              <Button
                variant="outline"
                disabled={busy || !value}
                onClick={() => (timer.running ? timer.stop() : timer.start(value ?? 30))}
                className={cx(timer.running && 'border-amber/60 text-amber')}
              >
                <Timer className="size-4" aria-hidden />
                {timer.running ? `${timer.left}s · parar` : 'Iniciar timer'}
              </Button>
            )}
            <Button className="ml-auto" disabled={busy || timer.running} onClick={() => save()}>
              {busy ? <Spinner /> : <Check className="size-4" aria-hidden />} Registrar série {nextNumber}
            </Button>
          </div>
        )
      }
    >
      {!ctx ? (
        error ? <Notice>{error}</Notice> : <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          {/* Hoje */}
          <div>
            <p className="mb-1.5 text-sm text-dust">
              Hoje: <strong className="text-starlight">{ctx.today.length}</strong> de {ctx.target.sets} séries
              {ctx.target.seconds && isTime ? ` de ${formatSeconds(ctx.target.seconds)}` : ''}
              {ctx.target.reps && !isTime ? ` de ${ctx.target.reps}` : ''}
              {ctx.exercise.perSide ? ' por lado' : ''}
            </p>
            {ctx.today.length > 0 && (
              <ol className="space-y-1">
                {ctx.today.map((s, i) => (
                  <li key={s.id} className="flex items-start gap-2 rounded-lg bg-lime/8 px-2.5 py-1.5 text-sm">
                    <span className="w-6 shrink-0 text-xs leading-5 text-faint">S{i + 1}</span>
                    <span className="w-16 shrink-0 font-semibold tabular-nums">{fmt(s)}</span>
                    <span className="flex-1 text-dust">
                      {s.notes && <span className="italic">“{s.notes}” </span>}
                      {s.completedAt && <span className="text-xs text-faint">{relativeTime(s.completedAt)}</span>}
                    </span>
                    <button onClick={() => removeToday(s.id)} aria-label="Apagar esta série" className="p-0.5 text-faint hover:text-rose-300">
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Última vez */}
          <div className="rounded-xl border border-nebula-soft/30 bg-nebula/10 px-3 py-2.5 text-sm">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-nebula-soft uppercase">
              <History className="size-3.5" aria-hidden /> Última vez{ctx.previous ? ` · ${relativeDay(ctx.previous.day)}` : ''}
            </p>
            {ctx.previous ? (
              <ol className="space-y-0.5">
                {ctx.previous.sets.map((s) => (
                  <li key={s.id} className="flex gap-2">
                    <span className="w-6 shrink-0 text-xs leading-5 text-faint">S{s.position + 1}</span>
                    <span className="w-16 shrink-0 font-semibold tabular-nums">{fmt(s)}</span>
                    {s.notes ? <span className="text-dust italic">“{s.notes}”</span> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-faint">Primeira vez registrando este exercício.</p>
            )}
            {ctx.previous?.notes && <p className="mt-1 text-dust italic">“{ctx.previous.notes}”</p>}
          </div>

          {timer.running ? (
            <div className="rounded-2xl border border-amber/40 bg-amber/10 py-6 text-center">
              <p className="text-xs text-amber">Segurando…</p>
              <p className="text-5xl font-semibold tabular-nums">{timer.left}s</p>
              <p className="mt-1 text-xs text-dust">Ao terminar, a série é registrada sozinha.</p>
            </div>
          ) : (
            <Field label={isTime ? 'Quanto tempo (segundos)' : 'Quantas repetições'}>
              <NumberInput
                value={value}
                onChange={setValue}
                className="text-center text-2xl font-semibold tabular-nums"
              />
            </Field>
          )}

          <Field label="Como foi (opcional)">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: consegui 12 cansando pouco" />
          </Field>
          {error && <Notice>{error}</Notice>}
        </div>
      )}
    </Modal>
  );
}

