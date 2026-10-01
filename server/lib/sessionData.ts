import { and, asc, desc, eq, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  exercises,
  sessionExercises,
  sessions,
  sets,
  type Exercise,
  type Session,
  type SessionExercise,
  type SetRow,
} from '../db/schema.js';
import { loadKey, summarizeSets, trend, type ExercisePerf } from '../../shared/load.js';

export type Previous = {
  sessionId: number;
  day: string;
  sessionName: string;
  notes: string | null;
  status: string;
  sets: SetRow[];
  perf: ExercisePerf;
};

export type Suggestion = { level: 'up' | 'almost'; text: string };

function groupSets(rows: SetRow[]) {
  const map = new Map<number, SetRow[]>();
  for (const s of rows) {
    const list = map.get(s.sessionExerciseId) ?? [];
    list.push(s);
    map.set(s.sessionExerciseId, list);
  }
  return map;
}

export async function setsOf(sessionExerciseIds: number[]) {
  if (!sessionExerciseIds.length) return new Map<number, SetRow[]>();
  const rows = await db
    .select()
    .from(sets)
    .where(inArray(sets.sessionExerciseId, sessionExerciseIds))
    .orderBy(asc(sets.position), asc(sets.id));
  return groupSets(rows);
}

/**
 * As N últimas vezes que cada exercício foi feito antes desta sessão
 * (em qualquer treino), mais recentes primeiro.
 */
export async function previousPerformances(
  exerciseIds: number[],
  before: Pick<Session, 'id' | 'day'>,
  perExercise = 2,
): Promise<Map<number, Previous[]>> {
  const out = new Map<number, Previous[]>();
  if (!exerciseIds.length) return out;

  const rows = await db
    .select({
      seId: sessionExercises.id,
      exerciseId: sessionExercises.exerciseId,
      status: sessionExercises.status,
      notes: sessionExercises.notes,
      sessionId: sessions.id,
      day: sessions.day,
      sessionName: sessions.name,
    })
    .from(sessionExercises)
    .innerJoin(sessions, eq(sessions.id, sessionExercises.sessionId))
    .where(
      and(
        inArray(sessionExercises.exerciseId, exerciseIds),
        eq(sessions.status, 'completed'),
        ne(sessions.id, before.id),
        eq(sessionExercises.status, 'done'),
        or(lt(sessions.day, before.day), and(eq(sessions.day, before.day), lt(sessions.id, before.id))),
      ),
    )
    .orderBy(desc(sessions.day), desc(sessions.id))
    // Limite generoso: ainda é pequeno para um app pessoal.
    .limit(exerciseIds.length * perExercise * 4 + 20);

  const seIdOf = new Map<Previous, number>();
  for (const r of rows) {
    const list = out.get(r.exerciseId) ?? [];
    if (list.length >= perExercise) continue;
    const { seId, exerciseId: _e, ...rest } = r;
    const p: Previous = { ...rest, sets: [], perf: summarizeSets([]) };
    list.push(p);
    out.set(r.exerciseId, list);
    seIdOf.set(p, seId);
  }

  const setMap = await setsOf([...seIdOf.values()]);
  for (const [p, seId] of seIdOf) {
    p.sets = (setMap.get(seId) ?? []).filter((x) => x.done);
    p.perf = summarizeSets(p.sets);
  }
  return out;
}

/** Bateu a meta: todas as séries previstas feitas, cada uma no topo da faixa. */
function hitTarget(
  perf: Previous,
  target: { sets: number | null; reps: number | null; seconds: number | null; measure: string },
) {
  const need = target.sets ?? 1;
  if (perf.sets.length < need) return false;
  if (target.measure === 'time') {
    if (!target.seconds) return false;
    return perf.sets.every((s) => (s.seconds ?? 0) >= target.seconds!);
  }
  if (!target.reps) return false;
  return perf.sets.every((s) => (s.reps ?? 0) >= target.reps!);
}

export function suggestionFor(
  se: SessionExercise,
  exercise: Exercise,
  prev: Previous[],
): Suggestion | null {
  if (exercise.kind === 'stretch' || exercise.kind === 'mobility') return null;
  const target = {
    sets: se.targetSets,
    reps: se.targetRepsMax ?? se.targetReps,
    seconds: se.targetSeconds,
    measure: exercise.measure,
  };
  const [last, before] = prev;
  if (!last || !hitTarget(last, target)) return null;
  const sameLoad =
    before &&
    last.perf.maxLoad != null &&
    before.perf.maxLoad != null &&
    Math.abs(last.perf.maxLoad - before.perf.maxLoad) < 0.05;
  if (before && hitTarget(before, target) && (sameLoad || last.perf.maxLoad == null)) {
    return {
      level: 'up',
      text: 'Meta batida nas duas últimas vezes: hora de subir o elástico ou apertar o ajuste (amarra, posição dos pés).',
    };
  }
  return { level: 'almost', text: 'Meta batida da última vez. Repetindo hoje, vale subir a carga na próxima.' };
}

/** Sessão completa: exercícios, séries, última vez de cada um e sugestão. */
export async function loadSessionFull(id: number) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!session) return null;

  const ses = await db
    .select()
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, id))
    .orderBy(asc(sessionExercises.position), asc(sessionExercises.id));

  const exIds = [...new Set(ses.map((s) => s.exerciseId))];
  const exRows = exIds.length
    ? await db.select().from(exercises).where(inArray(exercises.id, exIds))
    : [];
  const exById = new Map(exRows.map((e) => [e.id, e]));
  const setMap = await setsOf(ses.map((s) => s.id));
  const prev = await previousPerformances(exIds, session, 2);

  return {
    session,
    exercises: ses.map((se) => {
      const ex = exById.get(se.exerciseId)!;
      const p = prev.get(se.exerciseId) ?? [];
      return {
        ...se,
        exercise: ex,
        sets: setMap.get(se.id) ?? [],
        previous: p[0] ?? null,
        suggestion: ex ? suggestionFor(se, ex, p) : null,
      };
    }),
  };
}

/** A última sessão concluída do mesmo treino, antes desta. */
export async function previousSameWorkout(s: Session) {
  if (!s.workoutId) return null;
  const [row] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.workoutId, s.workoutId),
        eq(sessions.status, 'completed'),
        ne(sessions.id, s.id),
        or(lt(sessions.day, s.day), and(eq(sessions.day, s.day), lt(sessions.id, s.id))),
      ),
    )
    .orderBy(desc(sessions.day), desc(sessions.id))
    .limit(1);
  return row ?? null;
}

type ExerciseBlock = {
  exerciseId: number;
  name: string;
  measure: string;
  status: string | null;
  notes: string | null;
  sets: SetRow[];
  perf: ExercisePerf | null;
};

async function blocksOf(sessionId: number): Promise<ExerciseBlock[]> {
  const rows = await db
    .select({ se: sessionExercises, ex: exercises })
    .from(sessionExercises)
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(eq(sessionExercises.sessionId, sessionId))
    .orderBy(asc(sessionExercises.position), asc(sessionExercises.id));
  const setMap = await setsOf(rows.map((r) => r.se.id));
  return rows.map(({ se, ex }) => {
    const list = (setMap.get(se.id) ?? []).filter((s) => s.done);
    return {
      exerciseId: ex.id,
      name: ex.name,
      measure: ex.measure,
      status: se.status,
      notes: se.notes,
      sets: list,
      perf: list.length ? summarizeSets(list) : null,
    };
  });
}

/**
 * Comparação de uma sessão com a última vez do mesmo treino: exercício a
 * exercício, com tendência de reps, carga máxima, volume e tempo, além dos
 * exercícios que ficaram de fora ou entraram.
 */
export async function compareSession(id: number) {
  const [cur] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!cur) return null;
  const prevSession = await previousSameWorkout(cur);
  const curBlocks = await blocksOf(cur.id);
  const prevBlocks = prevSession ? await blocksOf(prevSession.id) : [];

  const order: number[] = [];
  for (const b of [...curBlocks, ...prevBlocks]) {
    if (!order.includes(b.exerciseId)) order.push(b.exerciseId);
  }

  const rows = order.map((exerciseId) => {
    const c = curBlocks.find((b) => b.exerciseId === exerciseId) ?? null;
    const p = prevBlocks.find((b) => b.exerciseId === exerciseId) ?? null;
    const cp = c?.perf ?? null;
    const pp = p?.perf ?? null;
    return {
      exerciseId,
      name: (c ?? p)!.name,
      measure: (c ?? p)!.measure,
      current: c,
      previous: p,
      trends: {
        sets: trend(cp?.sets, pp?.sets),
        reps: trend(cp?.totalReps, pp?.totalReps),
        bestReps: trend(cp?.bestReps, pp?.bestReps),
        seconds: trend(cp?.totalSeconds, pp?.totalSeconds),
        load: trend(cp?.maxLoad, pp?.maxLoad),
        volume: trend(cp?.volume, pp?.volume),
      },
      /** skipped = fez da outra vez e não desta; added = novo nesta sessão. */
      change: !cp && pp ? 'skipped' : cp && !pp ? (prevSession ? 'added' : 'first') : !cp && !pp ? 'none' : 'both',
    };
  });

  const totals = (blocks: ExerciseBlock[]) => {
    const all = blocks.flatMap((b) => b.sets);
    const perf = summarizeSets(all);
    return { exercises: blocks.filter((b) => b.perf).length, ...perf };
  };

  return {
    session: cur,
    previousSession: prevSession,
    rows,
    totals: { current: totals(curBlocks), previous: prevSession ? totals(prevBlocks) : null },
  };
}

/** Recorde: mais reps com a mesma carga, ou a maior carga já usada no exercício. */
export async function detectRecord(set: SetRow): Promise<'load' | 'reps' | null> {
  if (!set.done) return null;
  const others = await db
    .select({
      reps: sets.reps,
      seconds: sets.seconds,
      loadKg: sets.loadKg,
      bandIds: sets.bandIds,
      setup: sets.setup,
      weightKg: sets.weightKg,
    })
    .from(sets)
    .innerJoin(sessions, eq(sessions.id, sets.sessionId))
    .where(
      and(
        eq(sets.exerciseId, set.exerciseId),
        eq(sets.done, true),
        ne(sets.sessionId, set.sessionId),
        sql`${sessions.status} <> 'aborted'`,
      ),
    );
  if (!others.length) return null;

  if (set.loadKg != null) {
    const maxLoad = Math.max(...others.map((o) => o.loadKg ?? 0));
    if (set.loadKg > maxLoad + 0.05) return 'load';
  }
  const key = loadKey(set);
  const same = others.filter((o) => loadKey(o) === key);
  if (!same.length) return null;
  const bestReps = Math.max(...same.map((o) => o.reps ?? 0));
  const bestSecs = Math.max(...same.map((o) => o.seconds ?? 0));
  if ((set.reps ?? 0) > bestReps && bestReps > 0) return 'reps';
  if ((set.seconds ?? 0) > bestSecs && bestSecs > 0) return 'reps';
  return null;
}
