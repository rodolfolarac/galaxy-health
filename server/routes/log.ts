import { Router } from 'express';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { bodyMetrics, checkins, exercises } from '../db/schema.js';
import { dayString, idParam, notFound, optInt, optText, parseBody } from '../lib/http.js';

// ── Check-in rápido de alongamento ────────────────────────────

export const checkinsRouter = Router();

checkinsRouter.get('/', async (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : null;
  const to = typeof req.query.to === 'string' ? req.query.to : null;
  const where = [];
  if (from) where.push(gte(checkins.day, from));
  if (to) where.push(lte(checkins.day, to));
  const rows = await db
    .select()
    .from(checkins)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(checkins.day), asc(checkins.createdAt))
    .limit(500);
  res.json({ checkins: rows });
});

checkinsRouter.post('/', async (req, res) => {
  const body = parseBody(
    z.object({
      exerciseId: z.number().int().positive().nullish(),
      name: optText,
      day: dayString,
      seconds: optInt,
      notes: optText,
    }),
    req,
  );
  let name = body.name ?? null;
  if (body.exerciseId) {
    const [ex] = await db.select().from(exercises).where(eq(exercises.id, body.exerciseId));
    if (!ex) notFound('Exercício');
    name = ex.name;
  }
  const [row] = await db
    .insert(checkins)
    .values({
      exerciseId: body.exerciseId ?? null,
      name: name ?? 'Alongamento',
      day: body.day,
      seconds: body.seconds ?? null,
      notes: body.notes ?? null,
    })
    .returning();
  res.status(201).json(row);
});

checkinsRouter.delete('/:id', async (req, res) => {
  await db.delete(checkins).where(eq(checkins.id, idParam(req)));
  res.json({ deleted: true });
});

// ── Peso e medidas ────────────────────────────────────────────

export const bodyRouter = Router();

const measure = z.number().min(0).max(1000).nullish();

bodyRouter.get('/', async (_req, res) => {
  const rows = await db
    .select()
    .from(bodyMetrics)
    .orderBy(desc(bodyMetrics.day), desc(bodyMetrics.id))
    .limit(400);
  res.json({ metrics: rows });
});

bodyRouter.post('/', async (req, res) => {
  const body = parseBody(
    z.object({
      day: dayString,
      weightKg: measure,
      waistCm: measure,
      chestCm: measure,
      armCm: measure,
      thighCm: measure,
      notes: optText,
    }),
    req,
  );
  const [row] = await db.insert(bodyMetrics).values(body).returning();
  res.status(201).json(row);
});

bodyRouter.delete('/:id', async (req, res) => {
  await db.delete(bodyMetrics).where(eq(bodyMetrics.id, idParam(req)));
  res.json({ deleted: true });
});
