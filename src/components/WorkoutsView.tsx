import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarRange,
  Clock,
  Copy,
  ListChecks,
  Pencil,
  Play,
  Plus,
  Repeat,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { api, type WorkoutItemInput } from '../lib/api';
import { useCatalog } from '../lib/catalog';
import { formatClock, formatSeconds, KIND_LABEL, localDay, relativeDay, targetLabel, WEEKDAYS } from '../lib/format';
import type { ExerciseKind, Program, Workout } from '../lib/types';
import { LoadPicker, LoadSummary } from './Load';
import { EMPTY_GROUP_FILTER, GroupFilter, matchesGroup, type GroupFilterValue } from './MuscleGroups';
import { estimateSeconds, formatEstimate, planSets } from '../../shared/estimate';
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
  NumberInput,
  Panel,
  SectionTitle,
  Segmented,
  Select,
  Spinner,
  Textarea,
} from './ui';

export const WORKOUT_COLORS = ['#7c3aed', '#e8489f', '#3de0e8', '#ffb25c', '#22c55e', '#3b82f6', '#ef4444', '#a3e635'];

export function WorkoutsView({ onOpenSession }: { onOpenSession: (id: number) => void }) {
  const { workouts, exercises, refresh } = useCatalog();
  const [editing, setEditing] = useState<Workout | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const list = workouts.filter((w) => showArchived || !w.archived);

  async function start(w: Workout) {
    try {
      const full = await api.startSession(w.id, localDay());
      onOpenSession(full.session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar.');
    }
  }

  async function duplicate(w: Workout) {
    await api.duplicateWorkout(w.id).catch((e) => setError(e.message));
    await refresh(['workouts']);
  }

  async function remove(w: Workout) {
    if (!confirm(`Apagar o treino "${w.name}"? Se ele já foi feito, será só arquivado e o histórico continua.`)) return;
    await api.deleteWorkout(w.id).catch((e) => setError(e.message));
    await refresh(['workouts']);
  }

  return (
    <div className="space-y-10">
      <section>
        <SectionTitle
          action={
            <Button onClick={() => setEditing('new')} disabled={!exercises.length}>
              <Plus className="size-4" aria-hidden /> Novo treino
            </Button>
          }
        >
          Treinos
        </SectionTitle>
        {error && <Notice>{error}</Notice>}

        {!exercises.length ? (
          <EmptyState icon={<ListChecks className="size-8" />} title="Primeiro, os exercícios">
            Cadastre seus exercícios na aba Exercícios. Depois você monta aqui os treinos (A, B, C…) escolhendo
            quais entram, quantas séries e a meta de repetições.
          </EmptyState>
        ) : !list.length ? (
          <EmptyState
            icon={<ListChecks className="size-8" />}
            title="Nenhum treino ainda"
            action={<Button onClick={() => setEditing('new')}>Montar o primeiro treino</Button>}
          >
            Ex.: “A – Peito e tríceps”, “B – Costas e bíceps”, “Alongamento da manhã”.
          </EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((w) => (
              <Panel key={w.id} className={cx('p-4', w.archived && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl font-semibold text-white"
                    style={{ background: w.color }}
                  >
                    {w.code ?? w.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {w.name} {w.archived && <span className="text-xs text-faint">(arquivado)</span>}
                    </p>
                    <p className="text-xs text-dust">
                      {w.items.length} exercícios
                      {w.items.length > 0 && ` · ≈ ${formatEstimate(w.estimatedSeconds)}`} ·{' '}
                      {w.lastDay ? `feito ${relativeDay(w.lastDay)}` : 'nunca feito'}
                    </p>
                  </div>
                </div>
                <ol className="mt-3 space-y-1 text-sm text-dust">
                  {w.items.slice(0, 6).map((it) => {
                    const ex = exercises.find((e) => e.id === it.exerciseId);
                    return (
                      <li key={it.id} className="flex gap-2">
                        <span className="flex-1 truncate">{ex?.name ?? '—'}</span>
                        <span className="shrink-0 text-faint">
                          {ex && targetLabel({ ...it, measure: ex.measure, perSide: ex.perSide })}
                        </span>
                      </li>
                    );
                  })}
                  {w.items.length > 6 && <li className="text-faint">+{w.items.length - 6} exercícios</li>}
                </ol>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {!w.archived && (
                    <Button size="sm" onClick={() => start(w)}>
                      <Play className="size-4" aria-hidden /> Começar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setEditing(w)}>
                    <Pencil className="size-4" aria-hidden /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => duplicate(w)} title="Duplicar">
                    <Copy className="size-4" aria-hidden />
                    <span className="sr-only">Duplicar</span>
                  </Button>
                  {w.archived ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => api.updateWorkout(w.id, { archived: false }).then(() => refresh(['workouts']))}
                    >
                      Restaurar
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => remove(w)} className="ml-auto" title="Apagar">
                      <Trash2 className="size-4" aria-hidden />
                      <span className="sr-only">Apagar</span>
                    </Button>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        )}
        {workouts.some((w) => w.archived) && (
          <button onClick={() => setShowArchived((s) => !s)} className="mt-3 text-sm text-faint hover:text-dust">
            {showArchived ? 'Esconder arquivados' : 'Mostrar arquivados'}
          </button>
        )}
      </section>

      {workouts.some((w) => !w.archived) && <ProgramEditor />}

      {editing && (
        <WorkoutEditor
          workout={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh(['workouts']);
          }}
        />
      )}
    </div>
  );
}

// ── Editor de treino ──────────────────────────────────────────

type ItemDraft = WorkoutItemInput & { key: string };

function WorkoutEditor({
  workout,
  onClose,
  onSaved,
}: {
  workout: Workout | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { exercises, exerciseById } = useCatalog();
  const [name, setName] = useState(workout?.name ?? '');
  const [code, setCode] = useState(workout?.code ?? '');
  const [color, setColor] = useState(workout?.color ?? WORKOUT_COLORS[0]!);
  const [notes, setNotes] = useState(workout?.notes ?? '');
  const [items, setItems] = useState<ItemDraft[]>(
    () =>
      workout?.items.map(({ id, workoutId: _w, position: _p, ...rest }) => ({ ...rest, key: String(id) })) ?? [],
  );
  const [picking, setPicking] = useState(false);
  const [loadFor, setLoadFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (key: string, patch: Partial<ItemDraft>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const move = (i: number, d: -1 | 1) =>
    setItems((list) => {
      const next = [...list];
      const [x] = next.splice(i, 1);
      next.splice(i + d, 0, x!);
      return next;
    });

  function addExercises(ids: number[]) {
    setItems((list) => [
      ...list,
      ...ids.map((id) => {
        const ex = exerciseById.get(id)!;
        return {
          key: `n${id}-${Math.random()}`,
          exerciseId: id,
          targetSets: ex.defaultSets,
          targetReps: ex.measure === 'reps' ? ex.defaultReps : null,
          targetRepsMax: null,
          targetSeconds: ex.measure === 'time' ? ex.defaultSeconds : null,
          restSeconds: null,
          restPerSet: [],
          supersetGroup: null,
          bandIds: [],
          setup: null,
          notes: null,
        };
      }),
    ]);
  }

  async function save() {
    if (!name.trim()) return setError('Dê um nome ao treino.');
    setBusy(true);
    setError(null);
    const body = {
      name: name.trim(),
      code: code.trim() || null,
      color,
      notes: notes.trim() || null,
      items: items.map(({ key: _k, ...it }) => it),
    };
    try {
      if (workout) await api.updateWorkout(workout.id, body);
      else await api.createWorkout(body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
      setBusy(false);
    }
  }

  const loadItem = items.find((i) => i.key === loadFor);
  const estimate = estimateSeconds(planSets(items, exerciseById));

  return (
    <Modal
      wide
      title={workout ? `Editar ${workout.name}` : 'Novo treino'}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2 pb-1">
          {error ? (
            <span className="mr-auto text-sm text-rose-300">{error}</span>
          ) : (
            <span className="mr-auto flex items-center gap-1.5 text-sm text-dust" title="30 s por série + o descanso de cada série">
              <Clock className="size-4" aria-hidden />
              {items.length ? `≈ ${formatEstimate(estimate)}` : '—'}
            </span>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Spinner />} Salvar treino
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
          <Field label="Sigla">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))} placeholder="A" />
          </Field>
          <Field label="Nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Peito e tríceps" autoFocus={!workout} />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm text-dust">Cor</p>
          <div className="flex flex-wrap gap-2">
            {WORKOUT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cx('size-8 rounded-full ring-2 ring-offset-2 ring-offset-deep', color === c ? 'ring-white' : 'ring-transparent')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <Field label="Observações do treino">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Aquecimento, ordem, cuidados" />
        </Field>

        <div>
          <p className="mb-2 text-sm text-dust">Exercícios ({items.length})</p>
          <div className="space-y-2">
            {items.map((it, i) => {
              const ex = exerciseById.get(it.exerciseId);
              if (!ex) return null;
              const isTime = ex.measure === 'time';
              return (
                <div key={it.key} className="rounded-2xl border border-ridge bg-black/20 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-faint tabular-nums">{i + 1}.</span>
                    <span className="flex-1 font-medium">{ex.name}</span>
                    <button aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-faint hover:text-starlight disabled:opacity-30">
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button aria-label="Descer" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-faint hover:text-starlight disabled:opacity-30">
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                    <button aria-label="Remover" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} className="rounded p-1 text-faint hover:text-rose-300">
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Field label="Séries">
                      <NumberInput value={it.targetSets} onChange={(n) => update(it.key, { targetSets: n ?? 1, restPerSet: it.restPerSet.slice(0, n ?? 1) })} />
                    </Field>
                    {isTime ? (
                      <Field label={`Tempo${ex.perSide ? '/lado' : ''}`}>
                        <DurationInput value={it.targetSeconds} onChange={(n) => update(it.key, { targetSeconds: n })} />
                      </Field>
                    ) : (
                      <>
                        <Field label={`Reps mín${ex.perSide ? '/lado' : ''}`}>
                          <NumberInput value={it.targetReps} onChange={(n) => update(it.key, { targetReps: n })} />
                        </Field>
                        <Field label="Reps máx">
                          <NumberInput value={it.targetRepsMax} onChange={(n) => update(it.key, { targetRepsMax: n })} placeholder="—" />
                        </Field>
                      </>
                    )}
                    <Field label="Descanso padrão">
                      <DurationInput hint={false} value={it.restSeconds} onChange={(n) => update(it.key, { restSeconds: n })} placeholder={formatClock(ex.restSeconds)} />
                    </Field>
                    <Field label="Bi-set">
                      <Input
                        value={it.supersetGroup ?? ''}
                        onChange={(e) => update(it.key, { supersetGroup: e.target.value.toUpperCase().slice(0, 3) || null })}
                        placeholder="—"
                        title="Exercícios com a mesma letra são feitos em sequência (bi-set)"
                      />
                    </Field>
                  </div>
                  <RestPerSet
                    sets={it.targetSets}
                    fallback={it.restSeconds ?? ex.restSeconds}
                    value={it.restPerSet}
                    onChange={(restPerSet) => update(it.key, { restPerSet })}
                  />
                  {ex.equipment !== 'bodyweight' && (
                    <button
                      onClick={() => setLoadFor(it.key)}
                      className="mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-ridge px-3 py-2 text-left text-sm hover:border-nebula-soft/60"
                    >
                      <span className="text-faint">Carga inicial:</span>
                      {it.bandIds.length || it.setup ? (
                        <LoadSummary value={it} />
                      ) : (
                        <span className="text-faint">padrão do exercício (depois, sempre a da última vez)</span>
                      )}
                    </button>
                  )}
                  <Input
                    className="mt-2 py-2 text-sm"
                    value={it.notes ?? ''}
                    onChange={(e) => update(it.key, { notes: e.target.value || null })}
                    placeholder="Observação deste exercício neste treino"
                  />
                </div>
              );
            })}
          </div>
          <Button variant="outline" className="mt-3 w-full" onClick={() => setPicking(true)}>
            <Plus className="size-4" aria-hidden /> Adicionar exercícios
          </Button>
        </div>
      </div>

      {picking && (
        <PickExercises
          exercises={exercises.filter((e) => !e.archived)}
          onClose={() => setPicking(false)}
          onPick={(ids) => {
            addExercises(ids);
            setPicking(false);
          }}
        />
      )}
      {loadItem && (
        <LoadPicker
          title="Carga inicial no treino"
          initial={{ bandIds: loadItem.bandIds, setup: loadItem.setup, adjustPct: null, weightKg: null }}
          exerciseId={loadItem.exerciseId}
          onClose={() => setLoadFor(null)}
          onApply={(v) => {
            update(loadItem.key, { bandIds: v.bandIds, setup: v.setup });
            setLoadFor(null);
          }}
        />
      )}
    </Modal>
  );
}

function PickExercises({
  exercises,
  onClose,
  onPick,
}: {
  exercises: ReturnType<typeof useCatalog>['exercises'];
  onClose: () => void;
  onPick: (ids: number[]) => void;
}) {
  const { groupById, groupLabel } = useCatalog();
  const [sel, setSel] = useState<number[]>([]);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [group, setGroup] = useState<GroupFilterValue>(EMPTY_GROUP_FILTER);
  const list = exercises.filter(
    (e) =>
      (!kind || e.kind === kind) &&
      matchesGroup(e, group, groupById) &&
      e.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <Modal
      title="Escolher exercícios"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2 pb-1">
          <Button onClick={() => onPick(sel)} disabled={!sel.length}>
            Adicionar {sel.length || ''}
          </Button>
        </div>
      }
    >
      <div className="mb-3 space-y-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" autoFocus />
        <div className="flex flex-wrap gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-auto" aria-label="Tipo">
            <option value="">Todos os tipos</option>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <GroupFilter value={group} onChange={setGroup} className="contents" />
        </div>
      </div>
      <div className="space-y-1">
        {list.map((e) => {
          const on = sel.includes(e.id);
          return (
            <button
              key={e.id}
              onClick={() => setSel((s) => (on ? s.filter((x) => x !== e.id) : [...s, e.id]))}
              aria-pressed={on}
              className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left', on ? 'bg-nebula/25' : 'hover:bg-white/6')}
            >
              <span className={cx('flex size-5 items-center justify-center rounded border text-xs', on ? 'border-nebula-soft bg-nebula text-white' : 'border-ridge')}>
                {on ? sel.indexOf(e.id) + 1 : ''}
              </span>
              <span className="flex-1">{e.name}</span>
              <span className="text-xs text-faint">
                {KIND_LABEL[e.kind as ExerciseKind]}
                {groupLabel(e.muscleGroupId) && ` · ${groupLabel(e.muscleGroupId)}`}
              </span>
            </button>
          );
        })}
        {!list.length && <p className="py-4 text-center text-sm text-faint">Nada com esses filtros.</p>}
      </div>
    </Modal>
  );
}

/**
 * Descanso de cada série. Vazio = usa o descanso padrão do item. Fica
 * recolhido até alguma série ter um valor próprio.
 */
function RestPerSet({
  sets,
  fallback,
  value,
  onChange,
}: {
  sets: number;
  fallback: number;
  value: (number | null)[];
  onChange: (v: (number | null)[]) => void;
}) {
  const custom = value.some((v) => v != null);
  const [open, setOpen] = useState(custom);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1.5 text-xs text-nebula-soft hover:underline">
        <Timer className="size-3.5" aria-hidden /> Descanso diferente em cada série
      </button>
    );
  }
  const set = (i: number, n: number | null) => {
    const next = Array.from({ length: sets }, (_, j) => value[j] ?? null);
    next[i] = n;
    // Remove nulos no fim para não guardar lixo.
    while (next.length && next[next.length - 1] == null) next.pop();
    onChange(next);
  };
  return (
    <div className="mt-2 rounded-xl bg-black/20 p-2.5">
      <div className="mb-1.5 flex items-center justify-between text-xs text-dust">
        <span className="inline-flex items-center gap-1.5">
          <Timer className="size-3.5" aria-hidden /> Descanso após cada série
        </span>
        {custom && (
          <button onClick={() => onChange([])} className="text-faint hover:text-starlight">
            usar {formatSeconds(fallback)} em todas
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: sets }, (_, i) => (
          <label key={i} className="flex items-center gap-1.5 text-xs text-faint">
            S{i + 1}
            <DurationInput
              hint={false}
              value={value[i] ?? null}
              onChange={(n) => set(i, n)}
              placeholder={formatClock(fallback)}
              className="w-16 px-2 py-1.5 text-center text-sm"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Programa ──────────────────────────────────────────────────

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function ProgramEditor() {
  const { workouts } = useCatalog();
  const active = workouts.filter((w) => !w.archived);
  const byId = new Map(workouts.map((w) => [w.id, w]));
  const [p, setP] = useState<Program | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'info' } | null>(null);
  const [letters, setLetters] = useState('');

  useEffect(() => {
    api.program().then(setP).catch((e) => setMsg({ text: e.message, tone: 'error' }));
  }, []);

  if (!p) return null;
  const change = (next: Partial<Program>) => {
    setP({ ...p, ...next });
    setDirty(true);
    setMsg(null);
  };

  const dayList = (d: number) => p.weekly[String(d)] ?? [];
  const setDay = (d: number, ids: number[]) => change({ weekly: { ...p.weekly, [String(d)]: ids } });

  /** "A B C A B -" → sequência pelos códigos dos treinos ("-" = descanso). */
  function fromLetters() {
    const tokens = letters.trim().toUpperCase().split(/[\s,]+/).filter(Boolean);
    const out: (number | null)[] = [];
    for (const t of tokens) {
      if (t === '-' || t === 'D' || t === 'DESCANSO') {
        out.push(null);
        continue;
      }
      const w = active.find((x) => (x.code ?? '').toUpperCase() === t);
      if (!w) return setMsg({ text: `Nenhum treino com a sigla “${t}”.`, tone: 'error' });
      out.push(w.id);
    }
    change({ rotation: out, rotationIndex: 0 });
  }

  async function save() {
    try {
      const saved = await api.saveProgram({
        mode: p!.mode,
        weekly: p!.weekly,
        rotation: p!.rotation,
        rotationIndex: p!.rotationIndex,
      });
      setP(saved);
      setDirty(false);
      setMsg({ text: 'Programa salvo.', tone: 'info' });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Erro ao salvar.', tone: 'error' });
    }
  }

  return (
    <section>
      <SectionTitle action={<Button onClick={save} disabled={!dirty}>Salvar programa</Button>}>Programa</SectionTitle>
      <Segmented
        className="mb-4 max-w-md"
        value={p.mode}
        onChange={(mode) => change({ mode: mode as Program['mode'] })}
        options={[
          { value: 'weekly', label: <span className="inline-flex items-center gap-1.5"><CalendarRange className="size-4" aria-hidden /> Dias da semana</span> },
          { value: 'rotation', label: <span className="inline-flex items-center gap-1.5"><Repeat className="size-4" aria-hidden /> Sequência livre</span> },
        ]}
      />
      {msg && <div className="mb-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      {p.mode === 'weekly' ? (
        <div className="space-y-2">
          <p className="text-sm text-dust">Cada dia pode ter mais de um treino (ex.: musculação + alongamento).</p>
          {WEEK_ORDER.map((d) => (
            <Panel key={d} className="flex flex-wrap items-center gap-2 p-3">
              <span className="w-20 shrink-0 text-sm font-medium">{WEEKDAYS[d]}</span>
              <div className="flex flex-1 flex-wrap items-center gap-1.5">
                {dayList(d).map((id) => {
                  const w = byId.get(id);
                  return (
                    <Chip key={id} color={w?.color}>
                      {w ? (w.code ? `${w.code} · ${w.name}` : w.name) : 'removido'}
                      <button aria-label="Tirar" onClick={() => setDay(d, dayList(d).filter((x) => x !== id))} className="text-faint hover:text-rose-300">
                        <X className="size-3" aria-hidden />
                      </button>
                    </Chip>
                  );
                })}
                {!dayList(d).length && <span className="text-sm text-faint">descanso</span>}
              </div>
              <Select
                value=""
                onChange={(e) => e.target.value && setDay(d, [...dayList(d), Number(e.target.value)])}
                className="w-auto py-1.5 text-sm"
                aria-label={`Adicionar treino na ${WEEKDAYS[d]}`}
              >
                <option value="">+ treino</option>
                {active
                  .filter((w) => !dayList(d).includes(w.id))
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code ? `${w.code} · ` : ''}
                      {w.name}
                    </option>
                  ))}
              </Select>
              <Select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  const target = Number(e.target.value);
                  setDay(target, [...dayList(d)]);
                }}
                className="w-auto py-1.5 text-sm"
                aria-label={`Repetir ${WEEKDAYS[d]} em outro dia`}
                disabled={!dayList(d).length}
              >
                <option value="">repetir em…</option>
                {WEEK_ORDER.filter((x) => x !== d).map((x) => (
                  <option key={x} value={x}>
                    {WEEKDAYS[x]}
                  </option>
                ))}
              </Select>
            </Panel>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-dust">
            A sequência não depende do dia: ao concluir o treino da vez, o próximo vira o atual. Pulou um dia? Ele
            continua esperando.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              value={letters}
              onChange={(e) => setLetters(e.target.value)}
              placeholder="Monte pelas siglas: A B C A B -   (- = descanso)"
              className="max-w-md flex-1"
            />
            <Button variant="outline" onClick={fromLetters} disabled={!letters.trim()}>
              Montar
            </Button>
          </div>
          <ol className="flex flex-wrap gap-2">
            {p.rotation.map((id, i) => {
              const w = id ? byId.get(id) : null;
              const current = i === p.rotationIndex;
              return (
                <li
                  key={i}
                  className={cx(
                    'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm',
                    current ? 'border-nebula-soft bg-nebula/25' : 'border-ridge bg-black/20',
                  )}
                >
                  <span className="text-xs text-faint">{i + 1}</span>
                  {w ? (
                    <>
                      <span className="size-2.5 rounded-full" style={{ background: w.color }} aria-hidden />
                      {w.code ?? w.name}
                    </>
                  ) : (
                    <span className="text-faint">descanso</span>
                  )}
                  {current ? (
                    <span className="text-xs text-nebula-soft">← vez atual</span>
                  ) : (
                    <button onClick={() => change({ rotationIndex: i })} className="text-xs text-faint hover:text-starlight" title="Tornar a vez atual">
                      ir
                    </button>
                  )}
                  <button
                    aria-label="Remover da sequência"
                    onClick={() => {
                      const rotation = p.rotation.filter((_, j) => j !== i);
                      change({ rotation, rotationIndex: Math.min(p.rotationIndex, Math.max(rotation.length - 1, 0)) });
                    }}
                    className="text-faint hover:text-rose-300"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
          <Select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              change({ rotation: [...p.rotation, v === 'rest' ? null : Number(v)] });
            }}
            className="w-auto"
          >
            <option value="">+ adicionar à sequência</option>
            {active.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code ? `${w.code} · ` : ''}
                {w.name}
              </option>
            ))}
            <option value="rest">Descanso</option>
          </Select>
        </div>
      )}
    </section>
  );
}
