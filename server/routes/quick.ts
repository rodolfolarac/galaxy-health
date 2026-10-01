import { Router } from 'express';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { exercises, sessionExercises, sessions, sets, workoutItems } from '../db/schema.js';
import { dayQuery, dayString, HttpError, notFound, optInt, optText, parseBody } from '../lib/http.js';
import { detectRecord, previousPerformances } from '../lib/sessionData.js';
import { daySession, finalizeStaleSessions, nextOpenSet } from '../lib/sessionOps.js';

/**
 * Registro rápido: uma série solta de um exercício do treino, direto da tela
 * Hoje, sem abrir o treino inteiro. As séries vão se acumulando na sessão
 * daquele treino naquele dia — de manhã a parede, à tarde a prancha.
 */
export const quickRouter = Router();

/** Metas do exercício dentro do treino (ou os padrões do exercício). */
async function targetOf(workoutId: number, exerciseId: number) {
  const [ex] = await db.select().from(exercises).where(eq(exercises.id, exerciseId));
  if (!ex) notFound('Exercício');
  const [item] = await db
    .select()
    .from(workoutItems)
    .where(and(eq(workoutItems.workoutId, workoutId), eq(workoutItems.exerciseId, exerciseId)))
    .orderBy(asc(workoutItems.position))
    .limit(1);
  return {
    exercise: ex,
    sets: item?.targetSets ?? ex.defaultSets,
    reps: item?.targetReps ?? ex.defaultReps,
    seconds: item?.targetSeconds ?? ex.defaultSeconds,
  };
}

/** Séries já feitas hoje deste exercício na sessão do treino (se existir). */
async function doneToday(workoutId: number, exerciseId: number, day: string) {
  const [s] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.workoutId, workoutId), eq(sessions.day, day), ne(sessions.status, 'aborted')))
    .orderBy(desc(sessions.id))
    .limit(1);
  if (!s) return { session: null, sets: [] };
  const rows = await db
    .select()
    .from(sets)
    .where(and(eq(sets.sessionId, s.id), eq(sets.exerciseId, exerciseId), eq(sets.done, true)))
    .orderBy(asc(sets.completedAt), asc(sets.position));
  return { session: s, sets: rows };
}

quickRouter.get('/context', async (req, res) => {
  const day = dayQuery(req);
  const workoutId = Number(req.query.workoutId);
  const exerciseId = Number(req.query.exerciseId);
  if (!workoutId || !exerciseId) throw new HttpError(400, 'workoutId e exerciseId são obrigatórios.');
  const target = await targetOf(workoutId, exerciseId);
  const today = await doneToday(workoutId, exerciseId, day);
  // "Última vez" = antes de hoje (a sessão de hoje ainda está em andamento).
  const ref = today.session ?? { id: 0, day };
  const prev = await previousPerformances([exerciseId], ref, 1);
  res.json({
    exercise: target.exercise,
    target: { sets: target.sets, reps: target.reps, seconds: target.seconds },
    today: today.sets,
    previous: prev.get(exerciseId)?.[0] ?? null,
  });
});

quickRouter.post('/log', async (req, res) => {
  const body = parseBody(
    z.object({
      workoutId: z.number().int().positive(),
      exerciseId: z.number().int().positive(),
      day: dayString,
      reps: optInt,
      seconds: optInt,
      notes: optText,
    }),
    req,
  );
  await finalizeStaleSessions(body.day);
  const sessionId = await daySession(body.workoutId, body.day);
  const { se, set } = await nextOpenSet(sessionId, body.exerciseId);

  const [row] = await db
    .update(sets)
    .set({
      reps: body.reps ?? set.reps,
      seconds: body.seconds ?? set.seconds,
      notes: body.notes ?? null,
      done: true,
      completedAt: new Date(),
    })
    .where(eq(sets.id, set.id))
    .returning();
  await db.update(sessionExercises).set({ status: 'done' }).where(eq(sessionExercises.id, se.id));

  const target = await targetOf(body.workoutId, body.exerciseId);
  const today = await doneToday(body.workoutId, body.exerciseId, body.day);
  res.status(201).json({
    sessionId,
    set: row,
    record: await detectRecord(row!),
    done: today.sets.length,
    target: target.sets,
  });
});
