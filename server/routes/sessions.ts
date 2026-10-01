import { Router } from 'express';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { exercises, sessionExercises, sessions, sets, type SetRow } from '../db/schema.js';
import { loadCatalog } from '../lib/catalog.js';
import {
  HttpError,
  dayString,
  idList,
  idParam,
  notFound,
  optInt,
  optText,
  parseBody,
} from '../lib/http.js';
import {
  compareSession,
  detectRecord,
  loadSessionFull,
  previousPerformances,
} from '../lib/sessionData.js';
import {
  addExerciseToSession,
  createSession,
  exercisePlan,
  finalizeStaleSessions,
  finishSessionCore,
} from '../lib/sessionOps.js';

export const sessionsRouter = Router();

const startSchema = z.object({
  workoutId: z.number().int().positive().nullish(),
  day: dayString,
  name: optText,
});

/** Abre uma sessão a partir de um treino (ou vazia, para treino livre). */
sessionsRouter.post('/', async (req, res) => {
  const body = parseBody(startSchema, req);
  await finalizeStaleSessions(body.day);
  const id = await createSession(body.workoutId ?? null, body.day, body.name ?? null);
  res.status(201).json(await loadSessionFull(id));
});

/** Lista de sessões num intervalo de dias, com um resumo de cada uma. */
sessionsRouter.get('/', async (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : null;
  const to = typeof req.query.to === 'string' ? req.query.to : null;
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 500);

  const where = [];
  if (from) where.push(gte(sessions.day, from));
  if (to) where.push(lte(sessions.day, to));
  if (status) where.push(eq(sessions.status, status));

  const rows = await db
    .select()
    .from(sessions)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(sessions.day), desc(sessions.id))
    .limit(limit);

  const ids = rows.map((r) => r.id);
  const stats = ids.length
    ? await db
        .select({
          sessionId: sessionExercises.sessionId,
          done: sql<number>`count(*) filter (where ${sessionExercises.status} = 'done')`,
          skipped: sql<number>`count(*) filter (where ${sessionExercises.status} = 'skipped')`,
          total: sql<number>`count(*)`,
        })
        .from(sessionExercises)
        .where(inArray(sessionExercises.sessionId, ids))
        .groupBy(sessionExercises.sessionId)
    : [];
  const setStats = ids.length
    ? await db
        .select({
          sessionId: sets.sessionId,
          sets: sql<number>`count(*) filter (where ${sets.done})`,
          reps: sql<number>`coalesce(sum(${sets.reps}) filter (where ${sets.done}), 0)`,
        })
        .from(sets)
        .where(inArray(sets.sessionId, ids))
        .groupBy(sets.sessionId)
    : [];
  const byId = new Map(stats.map((s) => [s.sessionId, s]));
  const setsById = new Map(setStats.map((s) => [s.sessionId, s]));

  res.json({
    sessions: rows.map((r) => ({
      ...r,
      exercisesDone: Number(byId.get(r.id)?.done ?? 0),
      exercisesSkipped: Number(byId.get(r.id)?.skipped ?? 0),
      exercisesTotal: Number(byId.get(r.id)?.total ?? 0),
      setsDone: Number(setsById.get(r.id)?.sets ?? 0),
      repsDone: Number(setsById.get(r.id)?.reps ?? 0),
    })),
  });
});

sessionsRouter.get('/:id', async (req, res) => {
  const full = await loadSessionFull(idParam(req));
  if (!full) notFound('Sessão');
  res.json(full);
});

sessionsRouter.get('/:id/compare', async (req, res) => {
  const data = await compareSession(idParam(req));
  if (!data) notFound('Sessão');
  res.json(data);
});

const sessionPatch = z.object({
  notes: optText,
  rpe: z.number().int().min(1).max(10).nullish(),
  energy: z.number().int().min(1).max(5).nullish(),
  pain: optText,
  durationMs: z.number().int().min(0).max(24 * 3600 * 1000).optional(),
  day: dayString.optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

sessionsRouter.patch('/:id', async (req, res) => {
  const body = parseBody(sessionPatch, req);
  const [row] = await db
    .update(sessions)
    .set(body)
    .where(eq(sessions.id, idParam(req)))
    .returning();
  if (!row) notFound('Sessão');
  res.json(row);
});

/**
 * Encerra a sessão. Série com número preenchido conta como feita, mesmo sem
 * o ✓; série vazia é descartada. Exercício sem nenhuma série feita fica
 * marcado como pulado — é isso que o comparativo mostra como "deixou de fazer".
 */
sessionsRouter.post('/:id/finish', async (req, res) => {
  const body = parseBody(
    z.object({
      status: z.enum(['completed', 'aborted']),
      durationMs: z.number().int().min(0).max(24 * 3600 * 1000),
    }),
    req,
  );
  const row = await finishSessionCore(idParam(req), body.status, body.durationMs);
  if (!row) notFound('Sessão');
  res.json(row);
});

/** Reabre uma sessão encerrada para corrigir algo. */
sessionsRouter.post('/:id/reopen', async (req, res) => {
  const [row] = await db
    .update(sessions)
    .set({ status: 'active', endedAt: null })
    .where(eq(sessions.id, idParam(req)))
    .returning();
  if (!row) notFound('Sessão');
  res.json(await loadSessionFull(row.id));
});

sessionsRouter.delete('/:id', async (req, res) => {
  await db.delete(sessions).where(eq(sessions.id, idParam(req)));
  res.json({ deleted: true });
});

/** Acrescenta um exercício fora da ficha na sessão em andamento. */
sessionsRouter.post('/:id/exercises', async (req, res) => {
  const id = idParam(req);
  const { exerciseId } = parseBody(z.object({ exerciseId: z.number().int().positive() }), req);
  const [s] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!s) notFound('Sessão');
  const [ex] = await db.select().from(exercises).where(eq(exercises.id, exerciseId));
  if (!ex) notFound('Exercício');

  const [max] = await db
    .select({ n: sql<number>`coalesce(max(${sessionExercises.position}), -1)` })
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, id));
  const catalog = await loadCatalog();
  const prev = await previousPerformances([ex.id], s, 1);
  await addExerciseToSession(id, Number(max?.n ?? -1) + 1, exercisePlan(ex), prev.get(ex.id)?.[0], catalog.estimate);
  res.status(201).json(await loadSessionFull(id));
});

// ── Exercício dentro da sessão ────────────────────────────────

export const sessionExercisesRouter = Router();

sessionExercisesRouter.patch('/:id', async (req, res) => {
  const body = parseBody(
    z.object({
      notes: optText,
      status: z.enum(['pending', 'done', 'skipped']).optional(),
      position: z.number().int().min(0).optional(),
    }),
    req,
  );
  const [row] = await db
    .update(sessionExercises)
    .set(body)
    .where(eq(sessionExercises.id, idParam(req)))
    .returning();
  if (!row) notFound('Exercício da sessão');
  res.json(row);
});

sessionExercisesRouter.delete('/:id', async (req, res) => {
  await db.delete(sessionExercises).where(eq(sessionExercises.id, idParam(req)));
  res.json({ deleted: true });
});

/** Nova série copiando a carga da última série do exercício. */
sessionExercisesRouter.post('/:id/sets', async (req, res) => {
  const id = idParam(req);
  const [se] = await db.select().from(sessionExercises).where(eq(sessionExercises.id, id));
  if (!se) notFound('Exercício da sessão');
  const [last] = await db
    .select()
    .from(sets)
    .where(eq(sets.sessionExerciseId, id))
    .orderBy(desc(sets.position), desc(sets.id))
    .limit(1);
  const catalog = await loadCatalog();
  let load = last
    ? { bandIds: last.bandIds, setup: last.setup, adjustPct: last.adjustPct, weightKg: last.weightKg }
    : null;
  if (!load) {
    const [ex] = await db.select().from(exercises).where(eq(exercises.id, se.exerciseId));
    load = { bandIds: ex?.defaultBandIds ?? [], setup: ex?.defaultSetup ?? null, adjustPct: null, weightKg: null };
  }
  const [row] = await db
    .insert(sets)
    .values({
      sessionExerciseId: id,
      sessionId: se.sessionId,
      exerciseId: se.exerciseId,
      position: (last?.position ?? -1) + 1,
      ...load,
      loadKg: catalog.estimate(load),
      restSeconds: last?.restSeconds ?? se.restSeconds,
    })
    .returning();
  res.status(201).json(row);
});

// ── Série ─────────────────────────────────────────────────────

export const setsRouter = Router();

const setPatch = z.object({
  reps: optInt,
  seconds: optInt,
  weightKg: z.number().min(0).max(1000).nullish(),
  bandIds: idList.optional(),
  setup: optText,
  adjustPct: z.number().min(-90).max(500).nullish(),
  restSeconds: z.number().int().min(0).max(1800).nullish(),
  rpe: z.number().int().min(1).max(10).nullish(),
  notes: optText,
  done: z.boolean().optional(),
});

setsRouter.patch('/:id', async (req, res) => {
  const id = idParam(req);
  const body = parseBody(setPatch, req);
  const [cur] = await db.select().from(sets).where(eq(sets.id, id));
  if (!cur) notFound('Série');

  const merged = { ...cur, ...stripUndefined(body) } as SetRow;
  const catalog = await loadCatalog();
  const update: Partial<SetRow> = {
    ...stripUndefined(body),
    loadKg: catalog.estimate(merged),
  };
  if (body.done === true && !cur.done) update.completedAt = new Date();
  if (body.done === false) update.completedAt = null;

  const [row] = await db.update(sets).set(update).where(eq(sets.id, id)).returning();
  if (row!.done) {
    await db
      .update(sessionExercises)
      .set({ status: 'done' })
      .where(and(eq(sessionExercises.id, row!.sessionExerciseId), eq(sessionExercises.status, 'pending')));
  }
  const record = body.done || (row!.done && (body.reps !== undefined || body.seconds !== undefined))
    ? await detectRecord(row!)
    : null;
  res.json({ set: row, record });
});

setsRouter.delete('/:id', async (req, res) => {
  const [row] = await db.delete(sets).where(eq(sets.id, idParam(req))).returning();
  if (!row) throw new HttpError(404, 'Série não encontrada.');
  res.json({ deleted: true });
});

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
