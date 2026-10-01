/**
 * Carga estimada de uma série com elásticos.
 *
 * Elástico não tem peso exato: a marca informa uma faixa por cor. Usamos o
 * ponto médio dessa faixa, somamos os elásticos usados juntos e aplicamos o
 * ajuste estimado (%) que você anotou para a forma de prender o elástico —
 * amarra, pés afastados, "barriga" maior. Peso livre entra somado no final.
 *
 * O número não é "o peso real" — é uma régua consistente para comparar uma
 * sessão com a outra. Usado igual no servidor e no navegador.
 */

export type BandLike = { id: number; minKg: number | null; maxKg: number | null };
export type LoadInput = {
  bandIds: number[];
  adjustPct?: number | null;
  weightKg?: number | null;
  setup?: string | null;
};

export function bandMidKg(b: Pick<BandLike, 'minKg' | 'maxKg'>): number | null {
  if (b.minKg != null && b.maxKg != null) return (b.minKg + b.maxKg) / 2;
  return b.minKg ?? b.maxKg ?? null;
}

export function estimateLoad(input: LoadInput, bands: Map<number, BandLike>): number | null {
  let base = 0;
  let hasBand = false;
  for (const id of input.bandIds) {
    const b = bands.get(id);
    const mid = b ? bandMidKg(b) : null;
    if (mid != null) {
      base += mid;
      hasBand = true;
    }
  }
  const bandLoad = hasBand ? Math.max(0, base * (1 + (input.adjustPct ?? 0) / 100)) : 0;
  const weight = input.weightKg ?? 0;
  if (!hasBand && !weight) return null;
  return Math.round((bandLoad + weight) * 10) / 10;
}

/** Texto do ajuste normalizado, para "Pés afastados" e "pés  afastados" contarem igual. */
export function normalizeSetup(setup: string | null | undefined) {
  return (setup ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Identidade da carga: mesmos elásticos, mesmo ajuste descrito e mesmo peso. */
export function loadKey(input: LoadInput): string {
  const b = [...input.bandIds].sort((x, y) => x - y).join('+');
  return `b${b}|s${normalizeSetup(input.setup)}|w${input.weightKg ?? 0}`;
}

export type SetLike = {
  reps: number | null;
  seconds: number | null;
  loadKg: number | null;
  done: boolean;
};

export type ExercisePerf = {
  sets: number;
  totalReps: number;
  totalSeconds: number;
  bestReps: number;
  bestSeconds: number;
  maxLoad: number | null;
  /** Σ reps × carga. Só faz sentido com carga estimada. */
  volume: number;
};

export function summarizeSets(list: SetLike[]): ExercisePerf {
  const done = list.filter((s) => s.done);
  let maxLoad: number | null = null;
  let volume = 0;
  for (const s of done) {
    if (s.loadKg != null) {
      maxLoad = maxLoad == null ? s.loadKg : Math.max(maxLoad, s.loadKg);
      volume += (s.reps ?? 0) * s.loadKg;
    }
  }
  return {
    sets: done.length,
    totalReps: done.reduce((a, s) => a + (s.reps ?? 0), 0),
    totalSeconds: done.reduce((a, s) => a + (s.seconds ?? 0), 0),
    bestReps: done.reduce((a, s) => Math.max(a, s.reps ?? 0), 0),
    bestSeconds: done.reduce((a, s) => Math.max(a, s.seconds ?? 0), 0),
    maxLoad,
    volume: Math.round(volume),
  };
}

export type Trend = 'up' | 'down' | 'same' | 'new' | 'missing';

export function trend(cur: number | null | undefined, prev: number | null | undefined): Trend {
  const c = cur ?? 0;
  const p = prev ?? 0;
  if (!p && !c) return 'same';
  if (!p) return 'new';
  if (!c) return 'missing';
  if (Math.abs(c - p) < 0.05) return 'same';
  return c > p ? 'up' : 'down';
}
