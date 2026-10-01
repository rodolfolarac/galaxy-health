import { Router } from 'express';
import { asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { bands, sets, workoutItems, exercises, muscleGroups } from '../db/schema.js';
import { HttpError, idParam, notFound, optText, parseBody } from '../lib/http.js';
import { DEFAULT_BANDS } from '../lib/catalog.js';

/** Quantas séries, itens de treino e exercícios usam o elástico. */
async function usageCount(id: number) {
  const needle = JSON.stringify([id]);
  const setCol = sets.bandIds;
  const itemCol = workoutItems.bandIds;
  const exCol = exercises.defaultBandIds;
  const [a] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sets)
    .where(sql`${setCol} @> ${needle}::jsonb`);
  const [b] = await db
    .select({ n: sql<number>`count(*)` })
    .from(workoutItems)
    .where(sql`${itemCol} @> ${needle}::jsonb`);
  const [c] = await db
    .select({ n: sql<number>`count(*)` })
    .from(exercises)
    .where(sql`${exCol} @> ${needle}::jsonb`);
  return Number(a?.n ?? 0) + Number(b?.n ?? 0) + Number(c?.n ?? 0);
}

// ── Elásticos ─────────────────────────────────────────────────

const bandSchema = z.object({
  name: z.string().trim().min(1, 'informe o nome').max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor em hex, ex.: #ef4444'),
  brand: optText,
  minKg: z.number().min(0).max(500).nullish(),
  maxKg: z.number().min(0).max(500).nullish(),
  notes: optText,
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
});

export const bandsRouter = Router();

bandsRouter.get('/', async (_req, res) => {
  const rows = await db.select().from(bands).orderBy(asc(bands.sortOrder), asc(bands.id));
  res.json({ bands: rows });
});

bandsRouter.post('/', async (req, res) => {
  const body = parseBody(bandSchema, req);
  const [max] = await db.select({ n: sql<number>`coalesce(max(${bands.sortOrder}), -1)` }).from(bands);
  const [row] = await db
    .insert(bands)
    .values({ ...body, sortOrder: body.sortOrder ?? Number(max?.n ?? -1) + 1 })
    .returning();
  res.status(201).json(row);
});

bandsRouter.post('/defaults', async (_req, res) => {
  const existing = await db.select({ id: bands.id }).from(bands);
  if (existing.length) {
    res.status(409).json({ error: 'Você já tem elásticos cadastrados.' });
    return;
  }
  const rows = await db.insert(bands).values(DEFAULT_BANDS).returning();
  res.status(201).json({ bands: rows });
});

bandsRouter.patch('/:id', async (req, res) => {
  const body = parseBody(bandSchema.partial(), req);
  const [row] = await db.update(bands).set(body).where(eq(bands.id, idParam(req))).returning();
  if (!row) notFound('Elástico');
  res.json(row);
});

/** Apaga se nunca foi usado; senão arquiva, para o histórico continuar legível. */
bandsRouter.delete('/:id', async (req, res) => {
  const id = idParam(req);
  if ((await usageCount(id)) > 0) {
    await db.update(bands).set({ archived: true }).where(eq(bands.id, id));
    res.json({ archived: true });
    return;
  }
  await db.delete(bands).where(eq(bands.id, id));
  res.json({ deleted: true });
});

// ── Grupos musculares e subcategorias ─────────────────────────

const groupSchema = z.object({
  name: z.string().trim().min(1, 'informe o nome').max(60),
  parentId: z.number().int().positive().nullish(),
  sortOrder: z.number().int().optional(),
});

export const muscleGroupsRouter = Router();

/** Lista plana (grupos e subcategorias) com quantos exercícios cada um tem. */
muscleGroupsRouter.get('/', async (_req, res) => {
  const rows = await db
    .select()
    .from(muscleGroups)
    .orderBy(asc(muscleGroups.sortOrder), asc(muscleGroups.name));
  const counts = await db
    .select({ id: exercises.muscleGroupId, n: sql<number>`count(*)` })
    .from(exercises)
    .where(eq(exercises.archived, false))
    .groupBy(exercises.muscleGroupId);
  const by = new Map(counts.map((c) => [c.id, Number(c.n)]));
  res.json({ groups: rows.map((g) => ({ ...g, exerciseCount: by.get(g.id) ?? 0 })) });
});

async function assertParent(parentId: number | null | undefined, selfId?: number) {
  if (!parentId) return;
  const [p] = await db.select().from(muscleGroups).where(eq(muscleGroups.id, parentId));
  if (!p) notFound('Grupo');
  // Só dois níveis: grupo → subcategoria.
  if (p.parentId) throw new HttpError(400, 'Subcategoria não pode ter subcategoria.');
  if (selfId && p.id === selfId) throw new HttpError(400, 'Um grupo não pode ser pai dele mesmo.');
}

async function assertUniqueName(name: string, parentId: number | null, selfId?: number) {
  const siblings = await db
    .select()
    .from(muscleGroups)
    .where(parentId ? eq(muscleGroups.parentId, parentId) : isNull(muscleGroups.parentId));
  if (siblings.some((s) => s.id !== selfId && s.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpError(409, `Já existe “${name}” aqui.`);
  }
}

muscleGroupsRouter.post('/', async (req, res) => {
  const body = parseBody(groupSchema, req);
  await assertParent(body.parentId);
  await assertUniqueName(body.name, body.parentId ?? null);
  const [max] = await db
    .select({ n: sql<number>`coalesce(max(${muscleGroups.sortOrder}), -1)` })
    .from(muscleGroups)
    .where(body.parentId ? eq(muscleGroups.parentId, body.parentId) : isNull(muscleGroups.parentId));
  const [row] = await db
    .insert(muscleGroups)
    .values({ name: body.name, parentId: body.parentId ?? null, sortOrder: body.sortOrder ?? Number(max?.n ?? -1) + 1 })
    .returning();
  res.status(201).json(row);
});

muscleGroupsRouter.patch('/:id', async (req, res) => {
  const id = idParam(req);
  const body = parseBody(groupSchema.partial(), req);
  const [cur] = await db.select().from(muscleGroups).where(eq(muscleGroups.id, id));
  if (!cur) notFound('Grupo');
  if (body.parentId !== undefined) await assertParent(body.parentId, id);
  if (body.name) await assertUniqueName(body.name, body.parentId !== undefined ? (body.parentId ?? null) : cur.parentId, id);
  const [row] = await db.update(muscleGroups).set(body).where(eq(muscleGroups.id, id)).returning();
  res.json(row);
});

/**
 * Apagar subcategoria devolve os exercícios dela para o grupo pai. Apagar um
 * grupo apaga as subcategorias e deixa os exercícios sem grupo.
 */
muscleGroupsRouter.delete('/:id', async (req, res) => {
  const id = idParam(req);
  const [cur] = await db.select().from(muscleGroups).where(eq(muscleGroups.id, id));
  if (!cur) notFound('Grupo');
  if (cur.parentId) {
    await db.update(exercises).set({ muscleGroupId: cur.parentId }).where(eq(exercises.muscleGroupId, id));
  }
  await db.delete(muscleGroups).where(eq(muscleGroups.id, id));
  res.json({ deleted: true });
});
