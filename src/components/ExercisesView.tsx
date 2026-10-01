import { useEffect, useMemo, useState } from 'react';
import { Check, Dumbbell, ExternalLink, FolderInput, Pencil, Plus, Search, Trash2, Trophy, X } from 'lucide-react';
import { api, type ExerciseInput } from '../lib/api';
import { useCatalog } from '../lib/catalog';
import {
  EQUIPMENT_LABEL,
  formatDay,
  formatKg,
  formatSeconds,
  KIND_LABEL,
  relativeDay,
  youtubeId,
} from '../lib/format';
import type { Exercise, ExerciseKind, HistoryEntry, RecordRow, VideoLink } from '../lib/types';
import { LineChart, type Point } from './LineChart';
import { LoadPicker, LoadSummary } from './Load';
import { EMPTY_GROUP_FILTER, GroupFilter, GroupPicker, matchesGroup, type GroupFilterValue } from './MuscleGroups';
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

export function ExercisesView() {
  const { exercises, refresh, groupById, groupLabel } = useCatalog();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ExerciseKind | ''>('');
  const [group, setGroup] = useState<GroupFilterValue>(EMPTY_GROUP_FILTER);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);
  const [detail, setDetail] = useState<Exercise | null>(null);
  /** Modo de seleção para mover vários exercícios de grupo de uma vez. */
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [moveTo, setMoveTo] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const list = exercises.filter(
    (e) =>
      (showArchived || !e.archived) &&
      (!kind || e.kind === kind) &&
      matchesGroup(e, group, groupById) &&
      e.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  async function applyMove() {
    if (!selected.length) return;
    const r = await api.bulkGroup(selected, moveTo);
    await refresh(['exercises', 'groups']);
    setMsg(`${r.updated} exercício${r.updated > 1 ? 's' : ''} movido${r.updated > 1 ? 's' : ''} para ${groupLabel(moveTo) ?? 'sem grupo'}.`);
    setSelected([]);
    setSelecting(false);
  }

  return (
    <div>
      <SectionTitle
        action={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Novo exercício
          </Button>
        }
      >
        Exercícios
      </SectionTitle>

      {exercises.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="pl-9" />
          </div>
          <Select value={kind} onChange={(e) => setKind(e.target.value as ExerciseKind | '')} className="w-auto">
            <option value="">Todos os tipos</option>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <GroupFilter value={group} onChange={setGroup} className="contents" />
          <Button
            variant={selecting ? 'primary' : 'ghost'}
            onClick={() => {
              setSelecting((s) => !s);
              setSelected([]);
              setMsg(null);
            }}
          >
            <FolderInput className="size-4" aria-hidden /> {selecting ? 'Cancelar seleção' : 'Organizar'}
          </Button>
        </div>
      )}

      {msg && (
        <div className="mb-3">
          <Notice tone="info">{msg}</Notice>
        </div>
      )}

      {selecting && (
        <Panel className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm text-dust">
            {selected.length} selecionado{selected.length === 1 ? '' : 's'}
          </span>
          <button
            className="text-sm text-nebula-soft hover:underline"
            onClick={() => setSelected(selected.length === list.length ? [] : list.map((e) => e.id))}
          >
            {selected.length === list.length ? 'Limpar' : 'Selecionar todos os filtrados'}
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-sm text-dust">Mover para</span>
            <div className="min-w-56">
              <GroupPicker value={moveTo} onChange={setMoveTo} />
            </div>
            <Button onClick={applyMove} disabled={!selected.length}>
              Mover
            </Button>
          </div>
        </Panel>
      )}

      {!exercises.length ? (
        <EmptyState
          icon={<Dumbbell className="size-8" />}
          title="Monte seu acervo"
          action={<Button onClick={() => setEditing('new')}>Cadastrar o primeiro</Button>}
        >
          Cada exercício guarda como fazer, observações, links de vídeo, séries e reps padrão e o elástico
          que você costuma usar. Alongamentos também entram aqui.
        </EmptyState>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((e) => (
            <button
              key={e.id}
              onClick={() =>
                selecting
                  ? setSelected((s) => (s.includes(e.id) ? s.filter((x) => x !== e.id) : [...s, e.id]))
                  : setDetail(e)
              }
              aria-pressed={selecting ? selected.includes(e.id) : undefined}
              className={cx(
                'glass rounded-2xl p-4 text-left transition-colors hover:border-nebula-soft/50',
                e.archived && 'opacity-55',
                selecting && selected.includes(e.id) && 'border-nebula-soft bg-nebula/20',
              )}
            >
              <p className="flex items-start gap-2 font-medium">
                {selecting && (
                  <span
                    aria-hidden
                    className={cx(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border',
                      selected.includes(e.id) ? 'border-nebula-soft bg-nebula text-white' : 'border-ridge',
                    )}
                  >
                    {selected.includes(e.id) && <Check className="size-3.5" />}
                  </span>
                )}
                {e.name}
              </p>
              <p className="mt-0.5 text-xs text-dust">
                {KIND_LABEL[e.kind as ExerciseKind]}
                {groupLabel(e.muscleGroupId) && ` · ${groupLabel(e.muscleGroupId)}`}
                {e.perSide && ' · por lado'}
                {e.archived && ' · arquivado'}
              </p>
              <p className="mt-2 flex items-center gap-3 text-xs text-faint">
                <span>{e.timesDone ? `${e.timesDone}× · ${relativeDay(e.lastDay!)}` : 'nunca feito'}</span>
                {e.videos.length > 0 && <span>{e.videos.length} vídeo{e.videos.length > 1 ? 's' : ''}</span>}
              </p>
            </button>
          ))}
          {!list.length && <p className="text-sm text-faint">Nada com esses filtros.</p>}
        </div>
      )}
      {exercises.some((e) => e.archived) && (
        <button onClick={() => setShowArchived((s) => !s)} className="mt-3 text-sm text-faint hover:text-dust">
          {showArchived ? 'Esconder arquivados' : 'Mostrar arquivados'}
        </button>
      )}

      {editing && (
        <ExerciseEditor
          exercise={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (saved) => {
            setEditing(null);
            await refresh(['exercises']);
            if (detail) setDetail(saved);
          }}
        />
      )}
      {detail && !editing && (
        <ExerciseDetail
          exercise={exercises.find((e) => e.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
          onEdit={() => setEditing(exercises.find((e) => e.id === detail.id) ?? detail)}
          onDeleted={async () => {
            setDetail(null);
            await refresh(['exercises']);
          }}
        />
      )}
    </div>
  );
}

// ── Cadastro ──────────────────────────────────────────────────

export function ExerciseEditor({
  exercise,
  onClose,
  onSaved,
}: {
  exercise: Exercise | null;
  onClose: () => void;
  onSaved: (e: Exercise) => void;
}) {
  const [f, setF] = useState<ExerciseInput>(() =>
    exercise
      ? { ...exercise }
      : {
          name: '',
          kind: 'strength',
          equipment: 'band',
          measure: 'reps',
          perSide: false,
          defaultSets: 3,
          defaultReps: 12,
          defaultSeconds: 30,
          restSeconds: 60,
          defaultBandIds: [],
          defaultSetup: '',
          videos: [],
          muscleGroupId: null,
          instructions: '',
          notes: '',
        },
  );
  const [pickLoad, setPickLoad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ExerciseInput>) => setF((cur) => ({ ...cur, ...patch }));
  const videos = f.videos ?? [];

  function setKind(kind: ExerciseKind) {
    // Alongamento costuma ser por tempo e sem carga.
    if (kind === 'stretch' || kind === 'mobility') set({ kind, measure: 'time', equipment: 'bodyweight', defaultSets: f.defaultSets ?? 1, restSeconds: 15 });
    else if (kind === 'bodyweight') set({ kind, equipment: 'bodyweight' });
    else set({ kind });
  }

  async function save() {
    if (!f.name?.trim()) return setError('Dê um nome ao exercício.');
    const body: ExerciseInput = {
      name: f.name.trim(),
      kind: f.kind,
      muscleGroupId: f.muscleGroupId ?? null,
      equipment: f.equipment,
      measure: f.measure,
      perSide: !!f.perSide,
      defaultSets: f.defaultSets ?? 3,
      defaultReps: f.defaultReps ?? null,
      defaultSeconds: f.defaultSeconds ?? null,
      restSeconds: f.restSeconds ?? 60,
      defaultBandIds: f.defaultBandIds ?? [],
      defaultSetup: f.defaultSetup?.trim() || null,
      instructions: f.instructions?.trim() || null,
      notes: f.notes?.trim() || null,
      videos: videos.filter((v) => v.url.trim()).map((v) => ({ url: v.url.trim(), label: v.label?.trim() || null })),
    };
    setBusy(true);
    setError(null);
    try {
      const saved = exercise ? await api.updateExercise(exercise.id, body) : await api.createExercise(body);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
      setBusy(false);
    }
  }

  const setVideo = (i: number, patch: Partial<VideoLink>) =>
    set({ videos: videos.map((v, j) => (j === i ? { ...v, ...patch } : v)) });

  return (
    <Modal
      wide
      title={exercise ? `Editar ${exercise.name}` : 'Novo exercício'}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2 pb-1">
          {error && <span className="mr-auto text-sm text-rose-300">{error}</span>}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Spinner />} Salvar
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field label="Nome">
          <Input value={f.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="Rosca bíceps pisando no elástico" autoFocus={!exercise} />
        </Field>

        <Field group label="Tipo">
          <Segmented
            value={(f.kind ?? 'strength') as ExerciseKind}
            onChange={setKind}
            options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value: value as ExerciseKind, label }))}
          />
        </Field>

        <Field group label="Grupo muscular e subcategoria">
          <GroupPicker value={f.muscleGroupId} onChange={(muscleGroupId) => set({ muscleGroupId })} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Equipamento">
            <Select value={f.equipment} onChange={(e) => set({ equipment: e.target.value })}>
              {Object.entries(EQUIPMENT_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field group label="Conta por">
            <Segmented
              value={(f.measure ?? 'reps') as 'reps' | 'time'}
              onChange={(measure) => set({ measure })}
              options={[
                { value: 'reps', label: 'Repetições' },
                { value: 'time', label: 'Tempo' },
              ]}
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-dust">
            <input type="checkbox" checked={!!f.perSide} onChange={(e) => set({ perSide: e.target.checked })} className="size-4 accent-nebula" />
            Contagem por lado (unilateral)
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Séries padrão">
            <NumberInput value={f.defaultSets} onChange={(n) => set({ defaultSets: n ?? 1 })} />
          </Field>
          {f.measure === 'time' ? (
            <Field label="Tempo">
              <DurationInput value={f.defaultSeconds} onChange={(n) => set({ defaultSeconds: n })} />
            </Field>
          ) : (
            <Field label="Reps">
              <NumberInput value={f.defaultReps} onChange={(n) => set({ defaultReps: n })} />
            </Field>
          )}
          <Field label="Descanso">
            <DurationInput value={f.restSeconds} onChange={(n) => set({ restSeconds: n ?? 0 })} />
          </Field>
        </div>

        {f.equipment !== 'bodyweight' && (
          <div>
            <p className="mb-1.5 text-sm text-dust">Carga padrão (usada até existir histórico)</p>
            <button
              onClick={() => setPickLoad(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-ridge px-3 py-2.5 text-left text-sm hover:border-nebula-soft/60"
            >
              <LoadSummary value={{ bandIds: f.defaultBandIds ?? [], setup: f.defaultSetup }} />
            </button>
          </div>
        )}

        <Field label="Como fazer" hint="Postura, amplitude, onde prender o elástico, respiração.">
          <Textarea rows={3} value={f.instructions ?? ''} onChange={(e) => set({ instructions: e.target.value })} />
        </Field>
        <Field label="Observações">
          <Textarea rows={2} value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Cuidados, variações, o que sentir" />
        </Field>

        <div>
          <p className="mb-1.5 text-sm text-dust">Vídeos de referência</p>
          <div className="space-y-2">
            {videos.map((v, i) => (
              <div key={i} className="flex gap-2">
                <Input value={v.url} onChange={(e) => setVideo(i, { url: e.target.value })} placeholder="https://youtube.com/…" className="flex-[2]" />
                <Input value={v.label ?? ''} onChange={(e) => setVideo(i, { label: e.target.value })} placeholder="Descrição" className="flex-1" />
                <button aria-label="Remover vídeo" onClick={() => set({ videos: videos.filter((_, j) => j !== i) })} className="rounded-lg px-2 text-faint hover:text-rose-300">
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-1" onClick={() => set({ videos: [...videos, { url: '', label: '' }] })}>
            <Plus className="size-4" aria-hidden /> Adicionar link
          </Button>
        </div>
      </div>

      {pickLoad && (
        <LoadPicker
          title="Carga padrão"
          initial={{ bandIds: f.defaultBandIds ?? [], setup: f.defaultSetup ?? null, adjustPct: null, weightKg: null }}
          exerciseId={exercise?.id}
          onClose={() => setPickLoad(false)}
          onApply={(v) => {
            set({ defaultBandIds: v.bandIds, defaultSetup: v.setup });
            setPickLoad(false);
          }}
        />
      )}
    </Modal>
  );
}

// ── Detalhe + evolução ────────────────────────────────────────

type Metric = 'load' | 'best' | 'total' | 'volume';

function ExerciseDetail({
  exercise: e,
  onClose,
  onEdit,
  onDeleted,
}: {
  exercise: Exercise;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { groupLabel } = useCatalog();
  const [data, setData] = useState<{ entries: HistoryEntry[]; records: RecordRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isTime = e.measure === 'time';
  const hasLoad = !!data?.entries.some((x) => x.perf.maxLoad != null);
  const [metric, setMetric] = useState<Metric>('best');

  useEffect(() => {
    api.exerciseHistory(e.id).then((d) => {
      setData(d);
      if (d.entries.some((x) => x.perf.maxLoad != null)) setMetric('load');
    }).catch((err) => setError(err.message));
  }, [e.id]);

  const points: Point[] = useMemo(() => {
    if (!data) return [];
    return [...data.entries]
      .reverse()
      .filter((x) => x.perf.sets > 0)
      .map((x) => {
        const value =
          metric === 'load'
            ? (x.perf.maxLoad ?? 0)
            : metric === 'volume'
              ? x.perf.volume
              : metric === 'total'
                ? isTime ? x.perf.totalSeconds : x.perf.totalReps
                : isTime ? x.perf.bestSeconds : x.perf.bestReps;
        const sets = x.sets.map((s) => (isTime ? formatSeconds(s.seconds ?? 0) : s.reps)).join(' · ');
        return { key: String(x.sessionExerciseId), label: formatDay(x.day, { weekday: undefined }), value, detail: sets };
      });
  }, [data, metric, isTime]);

  async function remove() {
    if (!confirm(`Apagar "${e.name}"? Se ele já foi usado, será arquivado e o histórico continua.`)) return;
    await api.deleteExercise(e.id);
    onDeleted();
  }

  const metricOptions: { value: Metric; label: string }[] = [
    ...(hasLoad ? [{ value: 'load' as const, label: 'Carga máx' }] : []),
    { value: 'best', label: isTime ? 'Maior tempo' : 'Melhor série' },
    { value: 'total', label: isTime ? 'Tempo total' : 'Reps totais' },
    ...(hasLoad && !isTime ? [{ value: 'volume' as const, label: 'Volume' }] : []),
  ];
  const unit = metric === 'load' || metric === 'volume' ? ' kg' : isTime ? 's' : ' reps';

  return (
    <Modal
      wide
      title={e.name}
      onClose={onClose}
      footer={
        <div className="flex gap-2 pb-1">
          {e.archived ? (
            <Button variant="ghost" onClick={() => api.updateExercise(e.id, { archived: false }).then(onDeleted)}>
              Restaurar
            </Button>
          ) : (
            <Button variant="ghost" onClick={remove}>
              <Trash2 className="size-4" aria-hidden /> Apagar
            </Button>
          )}
          <Button className="ml-auto" onClick={onEdit}>
            <Pencil className="size-4" aria-hidden /> Editar
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-1.5">
          <Chip>{KIND_LABEL[e.kind as ExerciseKind]}</Chip>
          {groupLabel(e.muscleGroupId) && <Chip>{groupLabel(e.muscleGroupId)}</Chip>}
          <Chip>{EQUIPMENT_LABEL[e.equipment]}</Chip>
          {e.perSide && <Chip>por lado</Chip>}
        </div>

        {(e.instructions || e.notes) && (
          <div className="space-y-2 text-sm leading-relaxed">
            {e.instructions && <p className="whitespace-pre-line text-starlight/90">{e.instructions}</p>}
            {e.notes && <p className="whitespace-pre-line text-dust">{e.notes}</p>}
          </div>
        )}

        {e.videos.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {e.videos.map((v, i) => {
              const yt = youtubeId(v.url);
              return (
                <a key={i} href={v.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-ridge bg-black/25 hover:border-nebula-soft/60">
                  {yt && <img src={`https://i.ytimg.com/vi/${yt}/mqdefault.jpg`} alt="" className="aspect-video w-full object-cover opacity-85 group-hover:opacity-100" loading="lazy" />}
                  <span className="flex items-center gap-2 px-3 py-2 text-sm text-cyan">
                    <ExternalLink className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{v.label || v.url}</span>
                  </span>
                </a>
              );
            })}
          </div>
        )}

        {error && <Notice>{error}</Notice>}
        {!data ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : data.entries.length === 0 ? (
          <p className="text-sm text-faint">Ainda sem histórico — aparece aqui depois do primeiro treino com ele.</p>
        ) : (
          <>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">Evolução</h3>
                {metricOptions.length > 1 && <Segmented value={metric} onChange={setMetric} options={metricOptions} className="text-xs" />}
              </div>
              {points.length >= 2 ? (
                <Panel className="p-3">
                  <LineChart points={points} unit={unit} format={isTime && metric !== 'load' && metric !== 'volume' ? formatSeconds : undefined} />
                </Panel>
              ) : (
                <p className="text-sm text-faint">O gráfico aparece a partir da segunda vez.</p>
              )}
            </div>

            {data.records.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-2 font-medium">
                  <Trophy className="size-4 text-amber" aria-hidden /> Recordes por carga
                </h3>
                <div className="space-y-1.5">
                  {data.records.map((r) => (
                    <div key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-black/20 px-3 py-2">
                      <LoadSummary value={r} className="flex-1" />
                      <span className="font-semibold tabular-nums">{isTime ? formatSeconds(r.bestSeconds) : `${r.bestReps} reps`}</span>
                      <span className="text-xs text-faint">{relativeDay(r.day)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-2 font-medium">Histórico</h3>
              <div className="space-y-2">
                {data.entries.map((x) => (
                  <div key={x.sessionExerciseId} className="rounded-xl border border-ridge p-3">
                    <p className="flex items-center gap-2 text-sm">
                      <span className="size-2 rounded-full" style={{ background: x.color }} aria-hidden />
                      <span className="text-dust first-letter:uppercase">{formatDay(x.day)}</span>
                      <span className="text-faint">· {x.sessionName}</span>
                      {x.status === 'skipped' && <span className="text-amber">pulado</span>}
                    </p>
                    <div className="mt-1 space-y-0.5">
                      {x.sets.filter((s) => s.done).map((s) => (
                        <p key={s.id} className="flex flex-wrap items-center gap-x-3 text-sm">
                          <span className="w-5 text-faint tabular-nums">{s.position + 1}</span>
                          <span className="w-14 font-semibold tabular-nums">{isTime ? formatSeconds(s.seconds ?? 0) : `${s.reps} reps`}</span>
                          <LoadSummary value={s} loadKg={s.loadKg} showEmpty={false} className="text-xs" />
                          {s.notes && <span className="text-xs text-dust italic">{s.notes}</span>}
                        </p>
                      ))}
                    </div>
                    {x.perf.maxLoad != null && <p className="mt-1 text-xs text-faint">máx ≈ {formatKg(x.perf.maxLoad)} · volume {x.perf.volume} kg</p>}
                    {x.notes && <p className="mt-1 text-sm text-dust italic">“{x.notes}”</p>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
