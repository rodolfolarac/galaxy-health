import { and, asc, desc, eq, lt, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  exercises,
  program,
  sessionExercises,
  sessions,
  sets,
  workoutItems,
  workouts,
  type Exercise,
} from '../db/schema.js';
import { restForSet, workSeconds } from '../../shared/estimate.js';
import { loadCatalog } from './catalog.js';
import { notFound } from './http.js';
import { previousPerformances, type Previous } from './sessionData.js';
import { getProgram } from '../routes/workouts.js';

/**
 * Operações de sessão usadas por mais de uma rota: abrir o treino do dia,
 * encerrar, concluir sozinho o que ficou aberto de dias anteriores e o
 * registro rápido de uma série solta (treino fragmentado ao longo do dia).
 */

export type Plan = {
  exercise: Exercise;
  targetSets: number;
  targetReps: number | null;
  targetRepsMax: number | null;
  targetSeconds: number | null;
  restSeconds: number | null;
  restPerSet: (number | null)[];
  supersetGroup: string | null;
  bandIds: number[];
  setup: string | null;
};

/**
 * Cria as séries de um exercício na sessão. A carga vem, nesta ordem: da
 * última vez que o exercício foi feito (série por série), do que está na
 * ficha do treino, ou do padrão do exercício. As reps ficam vazias — a
 * tela mostra as da última vez como referência.
 */
export async function addExerciseToSession(
  sessionId: number,
  position: number,
  plan: Plan,
  prev: Previous | undefined,
  estimate: Awaited<ReturnType<typeof loadCatalog>>['estimate'],
) {
  const [se] = await db
    .insert(sessionExercises)
    .values({
      sessionId,
      exerciseId: plan.exercise.id,
      position,
      targetSets: plan.targetSets,
      targetReps: plan.targetReps,
      targetRepsMax: plan.targetRepsMax,
      targetSeconds: plan.targetSeconds,
      restSeconds: plan.restSeconds ?? plan.exercise.restSeconds,
      supersetGroup: plan.supersetGroup,
    })
    .returning();

  const rows = Array.from({ length: plan.targetSets }, (_, i) => {
    const from = prev?.sets[i] ?? prev?.sets[prev.sets.length - 1];
    const load = from
      ? { bandIds: from.bandIds, setup: from.setup, adjustPct: from.adjustPct, weightKg: from.weightKg }
      : { bandIds: plan.bandIds, setup: plan.setup, adjustPct: null, weightKg: null };
    return {
      sessionExerciseId: se!.id,
      sessionId,
      exerciseId: plan.exercise.id,
      position: i,
      ...load,
      loadKg: estimate(load),
      restSeconds: restForSet(plan, plan.exercise.restSeconds, i),
    };
  });
  if (rows.length) await db.insert(sets).values(rows);
  return se!;
}


/** Plano (metas e carga inicial) de cada exercício de um treino. */
export async function workoutPlans(workoutId: number): Promise<Plan[]> {
  const items = await db
    .select({ item: workoutItems, exercise: exercises })
    .from(workoutItems)
    .innerJoin(exercises, eq(exercises.id, workoutItems.exerciseId))
    .where(eq(workoutItems.workoutId, workoutId))
    .orderBy(asc(workoutItems.position), asc(workoutItems.id));
  return items.map(({ item, exercise }) => ({
    exercise,
    targetSets: item.targetSets,
    targetReps: item.targetReps ?? exercise.defaultReps,
    targetRepsMax: item.targetRepsMax,
    targetSeconds: item.targetSeconds ?? exercise.defaultSeconds,
    restSeconds: item.restSeconds,
    restPerSet: item.restPerSet,
    supersetGroup: item.supersetGroup,
    bandIds: item.bandIds.length ? item.bandIds : exercise.defaultBandIds,
    setup: item.setup ?? exercise.defaultSetup,
  }));
}

/** Plano de um exercício avulso (fora da ficha), com os padrões dele. */
export function exercisePlan(ex: Exercise): Plan {
  return {
    exercise: ex,
    targetSets: ex.defaultSets,
    targetReps: ex.defaultReps,
    targetRepsMax: null,
    targetSeconds: ex.defaultSeconds,
    restSeconds: null,
    restPerSet: [],
    supersetGroup: null,
    bandIds: ex.defaultBandIds,
    setup: ex.defaultSetup,
  };
}

/** Cria a sessão de um treino (ou treino livre) com todas as séries previstas. */
export async function createSession(workoutId: number | null, day: string, name: string | null) {
  const catalog = await loadCatalog();
  let title = name ?? 'Treino livre';
  let color = '#3de0e8';
  let plans: Plan[] = [];
  let rotationSlot: number | null = null;

  if (workoutId) {
    const [w] = await db.select().from(workouts).where(eq(workouts.id, workoutId));
    if (!w) notFound('Treino');
    title = w.code ? `${w.code} · ${w.name}` : w.name;
    color = w.color;
    plans = await workoutPlans(w.id);
    const p = await getProgram();
    if (p.mode === 'rotation' && p.rotation[p.rotationIndex] === w.id) rotationSlot = p.rotationIndex;
  }

  const [session] = await db
    .insert(sessions)
    .values({ workoutId, name: title, color, day, rotationSlot })
    .returning();

  const prev = await previousPerformances(plans.map((p) => p.exercise.id), session!, 1);
  let position = 0;
  for (const plan of plans) {
    await addExerciseToSession(session!.id, position++, plan, prev.get(plan.exercise.id)?.[0], catalog.estimate);
  }
  return session!.id;
}

/**
 * Encerra a sessão. Série com número preenchido conta como feita, mesmo sem
 * o ✓; série vazia é descartada. Exercício sem nenhuma série feita fica
 * marcado como pulado — é isso que o comparativo mostra como "deixou de fazer".
 * Sem duração registrada (treino feito em pedaços), usa o tempo de execução
 * estimado das séries feitas.
 */
export async function finishSessionCore(id: number, status: 'completed' | 'aborted', durationMs?: number) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!s) return null;

  await db
    .update(sets)
    .set({ done: true, completedAt: new Date() })
    .where(
      and(eq(sets.sessionId, id), eq(sets.done, false), sql`(${sets.reps} is not null or ${sets.seconds} is not null)`),
    );
  await db.delete(sets).where(and(eq(sets.sessionId, id), eq(sets.done, false)));

  const ses = await db.select().from(sessionExercises).where(eq(sessionExercises.sessionId, id));
  const done = await db
    .select({ s: sets, measure: exercises.measure, perSide: exercises.perSide })
    .from(sets)
    .innerJoin(exercises, eq(exercises.id, sets.exerciseId))
    .where(eq(sets.sessionId, id));
  const doneBy = new Map<number, number>();
  for (const d of done) doneBy.set(d.s.sessionExerciseId, (doneBy.get(d.s.sessionExerciseId) ?? 0) + 1);
  for (const se of ses) {
    const next = (doneBy.get(se.id) ?? 0) > 0 ? 'done' : 'skipped';
    if (se.status !== next) await db.update(sessionExercises).set({ status: next }).where(eq(sessionExercises.id, se.id));
  }

  let duration = durationMs ?? s.durationMs;
  if (!duration && done.length) {
    duration = done.reduce((acc, d) => acc + workSeconds({ measure: d.measure, perSide: d.perSide, seconds: d.s.seconds }), 0) * 1000;
  }

  const [row] = await db
    .update(sessions)
    .set({ status, durationMs: duration, endedAt: new Date() })
    .where(eq(sessions.id, id))
    .returning();

  // Sequência livre: concluir o treino da vez avança para o próximo.
  if (status === 'completed' && s.rotationSlot != null) {
    const p = await getProgram();
    if (p.mode === 'rotation' && p.rotationIndex === s.rotationSlot && p.rotation.length) {
      await db.update(program).set({ rotationIndex: (s.rotationSlot + 1) % p.rotation.length }).where(eq(program.id, 1));
    }
  }
  return row!;
}

/**
 * Treinos de dias anteriores que ficaram abertos (comum no registro em
 * pedaços): com alguma série feita, viram concluídos; sem nenhuma, somem.
 */
export async function finalizeStaleSessions(today: string) {
  const stale = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.status, 'active'), lt(sessions.day, today)));
  for (const { id } of stale) {
    const [d] = await db
      .select({ n: sql<number>`count(*)` })
      .from(sets)
      .where(and(eq(sets.sessionId, id), sql`(${sets.done} or ${sets.reps} is not null or ${sets.seconds} is not null)`));
    if (Number(d?.n ?? 0) > 0) await finishSessionCore(id, 'completed');
    else await db.delete(sessions).where(eq(sessions.id, id));
  }
}

/** A sessão daquele treino naquele dia (a mais recente que não foi interrompida), criando se não houver. */
export async function daySession(workoutId: number, day: string) {
  const [s] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.workoutId, workoutId), eq(sessions.day, day), ne(sessions.status, 'aborted')))
    .orderBy(desc(sessions.id))
    .limit(1);
  if (s) return s.id;
  return createSession(workoutId, day, null);
}

/**
 * Próxima série livre de um exercício na sessão: a primeira ainda não feita;
 * se todas já foram feitas, cria mais uma copiando a carga da última — dá
 * para registrar além do previsto (ex.: alongamento a cada meia hora).
 */
export async function nextOpenSet(sessionId: number, exerciseId: number) {
  const catalog = await loadCatalog();
  let [se] = await db
    .select()
    .from(sessionExercises)
    .where(and(eq(sessionExercises.sessionId, sessionId), eq(sessionExercises.exerciseId, exerciseId)))
    .limit(1);
  if (!se) {
    const [ex] = await db.select().from(exercises).where(eq(exercises.id, exerciseId));
    if (!ex) notFound('Exercício');
    const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    const [max] = await db
      .select({ n: sql<number>`coalesce(max(${sessionExercises.position}), -1)` })
      .from(sessionExercises)
      .where(eq(sessionExercises.sessionId, sessionId));
    const prev = await previousPerformances([ex.id], s!, 1);
    se = await addExerciseToSession(sessionId, Number(max?.n ?? -1) + 1, exercisePlan(ex), prev.get(ex.id)?.[0], catalog.estimate);
  }
  const list = await db
    .select()
    .from(sets)
    .where(eq(sets.sessionExerciseId, se.id))
    .orderBy(asc(sets.position), asc(sets.id));
  const open = list.find((x) => !x.done);
  if (open) return { se, set: open };
  const last = list[list.length - 1];
  const load = last
    ? { bandIds: last.bandIds, setup: last.setup, adjustPct: last.adjustPct, weightKg: last.weightKg }
    : { bandIds: [] as number[], setup: null, adjustPct: null, weightKg: null };
  const [row] = await db
    .insert(sets)
    .values({
      sessionExerciseId: se.id,
      sessionId,
      exerciseId,
      position: (last?.position ?? -1) + 1,
      ...load,
      loadKg: catalog.estimate(load),
      restSeconds: last?.restSeconds ?? se.restSeconds,
    })
    .returning();
  return { se, set: row! };
}


