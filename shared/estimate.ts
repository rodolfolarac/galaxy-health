/**
 * Tempo estimado de treino: cada série conta 30 s de execução (ou o tempo
 * da própria série, nos exercícios por tempo — prancha de 60 s leva 60 s,
 * dobrado se for por lado) mais o descanso depois dela. O descanso da última
 * série do treino não entra: o treino acabou.
 */

export const SECONDS_PER_SET = 30;

export type EstimateSet = {
  measure: string;
  perSide: boolean;
  /** Tempo alvo da série (só para exercícios por tempo). */
  seconds?: number | null;
  rest: number;
};

export function workSeconds(s: Pick<EstimateSet, 'measure' | 'perSide' | 'seconds'>) {
  if (s.measure === 'time' && s.seconds) return s.seconds * (s.perSide ? 2 : 1);
  return SECONDS_PER_SET;
}

export function estimateSeconds(sets: EstimateSet[]) {
  if (!sets.length) return 0;
  const total = sets.reduce((acc, s) => acc + workSeconds(s) + Math.max(0, s.rest), 0);
  return total - Math.max(0, sets[sets.length - 1]!.rest);
}

/** Descanso da série `i` de um item da ficha: o da série, o do item ou o do exercício. */
export function restForSet(
  item: { restPerSet?: (number | null)[] | null; restSeconds?: number | null },
  exerciseRest: number,
  i: number,
) {
  return item.restPerSet?.[i] ?? item.restSeconds ?? exerciseRest;
}

/** Séries de uma ficha de treino, prontas para estimar. */
export function planSets(
  items: {
    exerciseId: number;
    targetSets: number;
    targetSeconds: number | null;
    restSeconds: number | null;
    restPerSet: (number | null)[];
  }[],
  exerciseById: Map<number, { measure: string; perSide: boolean; restSeconds: number; defaultSeconds: number | null }>,
): EstimateSet[] {
  const out: EstimateSet[] = [];
  for (const it of items) {
    const ex = exerciseById.get(it.exerciseId);
    if (!ex) continue;
    for (let i = 0; i < it.targetSets; i++) {
      out.push({
        measure: ex.measure,
        perSide: ex.perSide,
        seconds: it.targetSeconds ?? ex.defaultSeconds,
        rest: restForSet(it, ex.restSeconds, i),
      });
    }
  }
  return out;
}

/** "45 min", "1h10". */
export function formatEstimate(totalSeconds: number) {
  const min = Math.max(1, Math.round(totalSeconds / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}
