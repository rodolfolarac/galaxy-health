import { Router } from 'express';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { bands, sets, workoutItems, exercises } from '../db/schema.js';
import { idParam, notFound, optText, parseBody } from '../lib/http.js';
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
