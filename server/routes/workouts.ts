import { Router } from 'express';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { program, sessions, workoutItems, workouts, type WorkoutItem } from '../db/schema.js';
import { HttpError, idList, idParam, notFound, optInt, optText, parseBody } from '../lib/http.js';

export const workoutsRouter = Router();

const itemSchema = z.object({
  exerciseId: z.number().int().positive(),
  targetSets: z.number().int().min(1).max(20).optional(),
  targetReps: optInt,
  targetRepsMax: optInt,
  targetSeconds: optInt,
  restSeconds: optInt,
  supersetGroup: optText,
  bandIds: idList.optional(),
  setup: optText,
  notes: optText,
});

const workoutSchema = z.object({
  name: z.string().trim().min(1, 'informe o nome').max(80),
  code: optText,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  notes: optText,
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
  items: z.array(itemSchema).max(60).optional(),
});

async function itemsFor(ids: number[]) {
  if (!ids.length) return new Map<number, WorkoutItem[]>();
  const rows = await db
    .select()
    .from(workoutItems)
    .where(inArray(workoutItems.workoutId, ids))
    .orderBy(asc(workoutItems.position), asc(workoutItems.id));
  const map = new Map<number, WorkoutItem[]>();
  for (const r of rows) {
    const list = map.get(r.workoutId) ?? [];
    list.push(r);
    map.set(r.workoutId, list);
  }
  return map;
}

async function replaceItems(workoutId: number, items: z.infer<typeof itemSchema>[]) {
  await db.delete(workoutItems).where(eq(workoutItems.workoutId, workoutId));
  if (items.length) {
    await db
      .insert(workoutItems)
      .values(items.map((it, position) => ({ ...it, workoutId, position })));
  }
}

async function getFull(id: number) {
  const [w] = await db.select().from(workouts).where(eq(workouts.id, id));
  if (!w) notFound('Treino');
  const items = (await itemsFor([id])).get(id) ?? [];
  return { ...w, items };
}

workoutsRouter.get('/', async (_req, res) => {
  const rows = await db
    .select()
    .from(workouts)
    .orderBy(asc(workouts.sortOrder), asc(workouts.id));
  const items = await itemsFor(rows.map((w) => w.id));
  const last = await db
    .select({ workoutId: sessions.workoutId, lastDay: sql<string>`max(${sessions.day})` })
    .from(sessions)
    .where(eq(sessions.status, 'completed'))
    .groupBy(sessions.workoutId);
  const lastBy = new Map(last.map((l) => [l.workoutId, l.lastDay]));
  res.json({
    workouts: rows.map((w) => ({
      ...w,
      items: items.get(w.id) ?? [],
      lastDay: lastBy.get(w.id) ?? null,
    })),
  });
});

workoutsRouter.get('/:id', async (req, res) => {
  res.json(await getFull(idParam(req)));
});

workoutsRouter.post('/', async (req, res) => {
  const { items, ...body } = parseBody(workoutSchema, req);
  const [max] = await db
    .select({ n: sql<number>`coalesce(max(${workouts.sortOrder}), -1)` })
    .from(workouts);
  const [w] = await db
    .insert(workouts)
    .values({ ...body, sortOrder: body.sortOrder ?? Number(max?.n ?? -1) + 1 })
    .returning();
  await replaceItems(w!.id, items ?? []);
  res.status(201).json(await getFull(w!.id));
});

workoutsRouter.patch('/:id', async (req, res) => {
  const id = idParam(req);
  const { items, ...body } = parseBody(workoutSchema.partial(), req);
  const [w] = await db
    .update(workouts)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(workouts.id, id))
    .returning();
  if (!w) notFound('Treino');
  if (items) await replaceItems(id, items);
  res.json(await getFull(id));
});

/** Duplica o treino inteiro (ex.: montar o "A2" a partir do "A"). */
workoutsRouter.post('/:id/duplicate', async (req, res) => {
  const src = await getFull(idParam(req));
  const [max] = await db
    .select({ n: sql<number>`coalesce(max(${workouts.sortOrder}), -1)` })
    .from(workouts);
  const [w] = await db
    .insert(workouts)
    .values({
      name: `${src.name} (cópia)`,
      code: src.code,
      color: src.color,
      notes: src.notes,
      sortOrder: Number(max?.n ?? -1) + 1,
    })
    .returning();
  await replaceItems(
    w!.id,
    src.items.map(({ id: _id, workoutId: _w, position: _p, ...rest }) => rest),
  );
  res.status(201).json(await getFull(w!.id));
});

/** Treino com histórico é arquivado, para a comparação com a "última vez" continuar funcionando. */
workoutsRouter.delete('/:id', async (req, res) => {
  const id = idParam(req);
  const [used] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sessions)
    .where(eq(sessions.workoutId, id));
  if (Number(used?.n ?? 0) > 0) {
    await db.update(workouts).set({ archived: true }).where(eq(workouts.id, id));
    res.json({ archived: true });
    return;
  }
  await db.delete(workouts).where(eq(workouts.id, id));
  res.json({ deleted: true });
});

// ── Programa: semana fixa ou sequência livre ──────────────────

export const programRouter = Router();

export async function getProgram() {
  const [row] = await db.select().from(program).where(eq(program.id, 1));
  if (row) return row;
  const [created] = await db
    .insert(program)
    .values({ id: 1 })
    .onConflictDoNothing()
    .returning();
  return created ?? (await db.select().from(program).where(eq(program.id, 1)))[0]!;
}

const programSchema = z.object({
  mode: z.enum(['weekly', 'rotation']),
  weekly: z.record(z.string().regex(/^[0-6]$/), z.array(z.number().int().positive()).max(6)),
  rotation: z.array(z.number().int().positive().nullable()).max(28),
  rotationIndex: z.number().int().min(0).optional(),
});

programRouter.get('/', async (_req, res) => {
  res.json(await getProgram());
});

programRouter.put('/', async (req, res) => {
  const body = parseBody(programSchema, req);
  await getProgram();
  const rotationIndex = Math.min(
    body.rotationIndex ?? 0,
    Math.max(body.rotation.length - 1, 0),
  );
  const [row] = await db
    .update(program)
    .set({ ...body, rotationIndex, updatedAt: new Date() })
    .where(eq(program.id, 1))
    .returning();
  res.json(row);
});

/** Pula a sequência para uma posição (ex.: "hoje vou fazer o C"). */
programRouter.post('/rotation-index', async (req, res) => {
  const { index } = parseBody(z.object({ index: z.number().int().min(0) }), req);
  const p = await getProgram();
  if (!p.rotation.length) throw new HttpError(400, 'A sequência está vazia.');
  const [row] = await db
    .update(program)
    .set({ rotationIndex: index % p.rotation.length, updatedAt: new Date() })
    .where(eq(program.id, 1))
    .returning();
  res.json(row);
});
