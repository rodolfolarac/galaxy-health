import { useEffect, useState } from 'react';
import { Link2, Weight } from 'lucide-react';
import { api } from '../lib/api';
import { useCatalog } from '../lib/catalog';
import type { SetRow } from '../lib/types';
import { formatKg } from '../lib/format';
import { normalizeSetup } from '../../shared/load';
import { Button, Chip, cx, Field, Modal, NumberInput, Textarea } from './ui';

export type LoadValue = {
  bandIds: number[];
  /** Como a carga foi ajustada, em texto livre: amarra, posição dos pés, barriga do elástico… */
  setup: string | null;
  /** Efeito estimado do ajuste em %, opcional. */
  adjustPct: number | null;
  weightKg: number | null;
};

/** Bolinha com a cor do elástico. */
export function BandSwatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block size-3 shrink-0 rounded-full ring-1 ring-white/30', className)}
      style={{ background: color }}
    />
  );
}

/**
 * Como a carga foi montada, em uma linha: elásticos coloridos, o ajuste
 * escrito, o % estimado e a carga estimada. É o que aparece em "última vez".
 */
export function LoadSummary({
  value,
  loadKg,
  className,
  showEmpty = true,
}: {
  value: Partial<LoadValue>;
  loadKg?: number | null;
  className?: string;
  showEmpty?: boolean;
}) {
  const { bandById } = useCatalog();
  const bands = (value.bandIds ?? []).map((id) => bandById.get(id)).filter((b) => !!b);
  const empty = !bands.length && !value.weightKg && !value.setup;
  if (empty && !showEmpty) return null;

  return (
    <span className={cx('inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm', className)}>
      {empty && <span className="text-faint">sem carga</span>}
      {bands.map((b) => (
        <span key={b.id} className="inline-flex items-center gap-1.5 text-starlight">
          <BandSwatch color={b.color} />
          {b.name}
        </span>
      ))}
      {!!value.weightKg && (
        <span className="inline-flex items-center gap-1 text-starlight">
          <Weight className="size-3.5 text-faint" aria-hidden />
          {formatKg(value.weightKg)}
        </span>
      )}
      {value.setup && (
        <span className="inline-flex items-start gap-1 text-cyan">
          <Link2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {value.setup}
          {value.adjustPct != null && value.adjustPct !== 0 && (
            <span className="text-faint">
              ({value.adjustPct > 0 ? '+' : ''}
              {value.adjustPct}%)
            </span>
          )}
        </span>
      )}
      {loadKg != null && <span className="text-xs text-faint">≈ {formatKg(loadKg)}</span>}
    </span>
  );
}

/**
 * Escolha da carga de uma série: um ou mais elásticos, o ajuste escrito
 * livremente (com sugestões do que você já escreveu neste exercício), um %
 * estimado opcional e peso livre.
 */
export function LoadPicker({
  initial,
  exerciseId,
  title = 'Carga da série',
  onClose,
  onApply,
  allowApplyRest,
}: {
  initial: LoadValue;
  /** Para sugerir os ajustes já escritos neste exercício. */
  exerciseId?: number;
  title?: string;
  onClose: () => void;
  onApply: (v: LoadValue, scope: 'one' | 'rest') => void;
  allowApplyRest?: boolean;
}) {
  const { bands, estimate } = useCatalog();
  const [v, setV] = useState<LoadValue>(initial);
  const [past, setPast] = useState<string[]>([]);
  const est = estimate(v);

  useEffect(() => {
    if (exerciseId) api.exerciseSetups(exerciseId).then((r) => setPast(r.setups)).catch(() => {});
  }, [exerciseId]);

  const toggleBand = (id: number) =>
    setV((cur) => ({
      ...cur,
      bandIds: cur.bandIds.includes(id) ? cur.bandIds.filter((x) => x !== id) : [...cur.bandIds, id],
    }));

  const activeBands = bands.filter((b) => !b.archived || v.bandIds.includes(b.id));
  const clean = (x: LoadValue): LoadValue => ({ ...x, setup: x.setup?.trim() || null });
  const current = normalizeSetup(v.setup);
  const suggestions = past.filter((s) => normalizeSetup(s) !== current).slice(0, 8);

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <span className="mr-auto text-sm text-dust">
            Carga estimada: <strong className="text-starlight">{est != null ? formatKg(est) : '—'}</strong>
          </span>
          {allowApplyRest && (
            <Button variant="outline" onClick={() => onApply(clean(v), 'rest')}>
              Esta e as seguintes
            </Button>
          )}
          <Button onClick={() => onApply(clean(v), 'one')}>Aplicar</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm text-dust">Elásticos (pode combinar mais de um)</p>
          {activeBands.length ? (
            <div className="flex flex-wrap gap-2">
              {activeBands.map((b) => (
                <Chip
                  key={b.id}
                  color={b.color}
                  active={v.bandIds.includes(b.id)}
                  onClick={() => toggleBand(b.id)}
                  className="px-3 py-1.5 text-sm"
                >
                  {b.name}
                  {b.minKg != null && (
                    <span className="text-faint">
                      {b.minKg}–{b.maxKg} kg
                    </span>
                  )}
                </Chip>
              ))}
            </div>
          ) : (
            <p className="text-sm text-faint">Cadastre seus elásticos em Ajustes.</p>
          )}
        </div>

        <div>
          <Field
            label="Como ajustou a carga"
            hint="Escreva do seu jeito: amarra, nó, posição dos pés, “barriga” do elástico, pegada, onde prendeu."
          >
            <Textarea
              rows={2}
              value={v.setup ?? ''}
              onChange={(e) => setV({ ...v, setup: e.target.value })}
              placeholder="Ex.: nó a 10 cm da ponta + pés dois palmos além do ombro"
            />
          </Field>
          {suggestions.length > 0 && (
            <div className="mt-2">
              <p className="mb-1.5 text-xs text-faint">Já usados neste exercício:</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <Chip key={s} onClick={() => setV({ ...v, setup: s })} className="max-w-full text-left">
                    <span className="truncate">{s}</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ajuste estimado (%)" hint="Opcional. +15 = uns 15% mais pesado.">
            <NumberInput inputMode="text" value={v.adjustPct} onChange={(n) => setV({ ...v, adjustPct: n })} placeholder="—" />
          </Field>
          <Field label="Peso livre (kg)" hint="Halter, mochila, anilha.">
            <NumberInput decimal value={v.weightKg} onChange={(n) => setV({ ...v, weightKg: n })} placeholder="0" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Agrupa séries seguidas com a mesma carga para mostrar
 * "Vermelho · nó na ponta → 12 · 12 · 10" em vez de repetir a carga a cada série.
 */
export function groupSetsByLoad(sets: SetRow[], measure: string) {
  const groups: { set: SetRow; values: string[] }[] = [];
  for (const s of sets) {
    const v = measure === 'time' ? `${s.seconds ?? '—'}s` : String(s.reps ?? '—');
    const last = groups[groups.length - 1];
    const same =
      last &&
      JSON.stringify([last.set.bandIds, normalizeSetup(last.set.setup), last.set.adjustPct, last.set.weightKg]) ===
        JSON.stringify([s.bandIds, normalizeSetup(s.setup), s.adjustPct, s.weightKg]);
    if (same) last.values.push(v);
    else groups.push({ set: s, values: [v] });
  }
  return groups;
}
