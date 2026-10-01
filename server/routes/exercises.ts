import { Router } from 'express';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { exercises, sessionExercises, sessions, sets, workoutItems } from '../db/schema.js';
import { idList, idParam, notFound, optInt, optText, parseBody } from '../lib/http.js';
import { loadKey, summarizeSets } from '../../shared/load.js';

export const exercisesRouter = Router();

export const KINDS = ['strength', 'stretch', 'mobility', 'bodyweight', 'cardio'] as const;

const videoSchema = z.object({
  url: z.string().trim().url('link de vídeo inválido').max(1000),
  label: optText,
});

const exerciseSchema = z.object({
  name: z.string().trim().min(1, 'informe o nome').max(120),
  kind: z.enum(KINDS),
  muscleGroupId: z.number().int().positive().nullish(),
  equipment: z.enum(['band', 'bodyweight', 'other']),
  measure: z.enum(['reps', 'time']),
  perSide: z.boolean().optional(),
  defaultSets: z.number().int().min(1).max(20).optional(),
  defaultReps: optInt,
  defaultSeconds: optInt,
  restSeconds: z.number().int().min(0).max(1800).optional(),
  defaultBandIds: idList.optional(),
  defaultSetup: optText,
  instructions: optText,
  notes: optText,
  videos: z.array(videoSchema).max(10).optional(),
  archived: z.boolean().optional(),
});

/** Lista com "feito pela última vez em" e quantas sessões, para o acervo. */
exercisesRouter.get('/', async (_req, res) => {
  const rows = await db.select().from(exercises).orderBy(asc(exercises.name));
  const usage = await db
    .select({
      exerciseId: sessionExercises.exerciseId,
      times: sql<number>`count(distinct ${sessions.id})`,
      lastDay: sql<string | null>`max(${sessions.day})`,
    })
    .from(sessionExercises)
    .innerJoin(sessions, eq(sessions.id, sessionExercises.sessionId))
    .where(eq(sessionExercises.status, 'done'))
    .groupBy(sessionExercises.exerciseId);
  const byId = new Map(usage.map((u) => [u.exerciseId, u]));
  res.json({
    exercises: rows.map((e) => ({
      ...e,
      timesDone: Number(byId.get(e.id)?.times ?? 0),
      lastDay: byId.get(e.id)?.lastDay ?? null,
    })),
  });
});

exercisesRouter.post('/', async (req, res) => {
  const body = parseBody(exerciseSchema, req);
  const [row] = await db.insert(exercises).values(body).returning();
  res.status(201).json(row);
});

/** Move vários exercícios de uma vez para um grupo/subcategoria (ou nenhum). */
exercisesRouter.post('/bulk-group', async (req, res) => {
  const { ids, muscleGroupId } = parseBody(
    z.object({
      ids: z.array(z.number().int().positive()).min(1).max(500),
      muscleGroupId: z.number().int().positive().nullable(),
    }),
    req,
  );
  const rows = await db
    .update(exercises)
    .set({ muscleGroupId, updatedAt: new Date() })
    .where(inArray(exercises.id, ids))
    .returning({ id: exercises.id });
  res.json({ updated: rows.length });
});

exercisesRouter.get('/:id', async (req, res) => {
  const [row] = await db.select().from(exercises).where(eq(exercises.id, idParam(req)));
  if (!row) notFound('Exercício');
  res.json(row);
});

exercisesRouter.patch('/:id', async (req, res) => {
  const body = parseBody(exerciseSchema.partial(), req);
  const [row] = await db
    .update(exercises)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(exercises.id, idParam(req)))
    .returning();
  if (!row) notFound('Exercício');
  res.json(row);
});

/** Apaga se nunca foi feito nem está num treino; senão arquiva. */
exercisesRouter.delete('/:id', async (req, res) => {
  const id = idParam(req);
  const [used] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sessionExercises)
    .where(eq(sessionExercises.exerciseId, id));
  const [inWorkout] = await db
    .select({ n: sql<number>`count(*)` })
    .from(workoutItems)
    .where(eq(workoutItems.exerciseId, id));
  if (Number(used?.n ?? 0) > 0 || Number(inWorkout?.n ?? 0) > 0) {
    await db.update(exercises).set({ archived: true }).where(eq(exercises.id, id));
    res.json({ archived: true });
    return;
  }
  await db.delete(exercises).where(eq(exercises.id, id));
  res.json({ deleted: true });
});

/** Ajustes de carga já escritos neste exercício (mais recentes primeiro), para sugerir no campo. */
exercisesRouter.get('/:id/setups', async (req, res) => {
  const rows = await db
    .select({ setup: sets.setup, last: sql<string>`max(${sets.completedAt})` })
    .from(sets)
    .where(and(eq(sets.exerciseId, idParam(req)), sql`${sets.setup} is not null and ${sets.setup} <> ''`))
    .groupBy(sets.setup)
    .orderBy(sql`max(${sets.completedAt}) desc nulls last`)
    .limit(30);
  res.json({ setups: rows.map((r) => r.setup!) });
});

/**
 * Histórico de um exercício: cada sessão em que foi feito, com as séries,
 * o resumo (reps, carga máxima, volume) e os recordes por combinação de carga.
 */
exercisesRouter.get('/:id/history', async (req, res) => {
  const id = idParam(req);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 60) || 60, 1), 365);

  const entries = await db
    .select({
      sessionExerciseId: sessionExercises.id,
      status: sessionExercises.status,
      notes: sessionExercises.notes,
      sessionId: sessions.id,
      day: sessions.day,
      sessionName: sessions.name,
      color: sessions.color,
    })
    .from(sessionExercises)
    .innerJoin(sessions, eq(sessions.id, sessionExercises.sessionId))
    .where(and(eq(sessionExercises.exerciseId, id), inArray(sessions.status, ['completed', 'active'])))
    .orderBy(desc(sessions.day), desc(sessions.id))
    .limit(limit);

  if (!entries.length) {
    res.json({ entries: [], records: [] });
    return;
  }

  const allSets = await db
    .select()
    .from(sets)
    .where(
      inArray(
        sets.sessionExerciseId,
        entries.map((e) => e.sessionExerciseId),
      ),
    )
    .orderBy(asc(sets.position), asc(sets.id));

  const bySe = new Map<number, typeof allSets>();
  for (const s of allSets) {
    const list = bySe.get(s.sessionExerciseId) ?? [];
    list.push(s);
    bySe.set(s.sessionExerciseId, list);
  }

  // Recorde por combinação de carga: o máximo de reps (ou segundos) com ela.
  const records = new Map<
    string,
    { key: string; bandIds: number[]; setup: string | null; weightKg: number | null; loadKg: number | null; bestReps: number; bestSeconds: number; day: string }
  >();
  for (const e of [...entries].reverse()) {
    for (const s of bySe.get(e.sessionExerciseId) ?? []) {
      if (!s.done) continue;
      const key = loadKey(s);
      const cur = records.get(key);
      const reps = s.reps ?? 0;
      const secs = s.seconds ?? 0;
      if (!cur) {
        records.set(key, {
          key,
          bandIds: s.bandIds,
          setup: s.setup,
          weightKg: s.weightKg,
          loadKg: s.loadKg,
          bestReps: reps,
          bestSeconds: secs,
          day: e.day,
        });
      } else if (reps > cur.bestReps || secs > cur.bestSeconds) {
        cur.bestReps = Math.max(cur.bestReps, reps);
        cur.bestSeconds = Math.max(cur.bestSeconds, secs);
        cur.day = e.day;
      }
    }
  }

  res.json({
    entries: entries.map((e) => {
      const list = bySe.get(e.sessionExerciseId) ?? [];
      return { ...e, sets: list, perf: summarizeSets(list) };
    }),
    records: [...records.values()].sort((a, b) => (b.loadKg ?? 0) - (a.loadKg ?? 0)),
  });
});

