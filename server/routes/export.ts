import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  bands,
  bodyMetrics,
  checkins,
  exercises,
  program,
  sessionExercises,
  sessions,
  sets,
  workoutItems,
  workouts,
} from '../db/schema.js';

export const exportRouter = Router();

function csvCell(v: unknown) {
  if (v == null) return '';
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Uma linha por série feita. Separador ";" para abrir direto no Excel em português. */
exportRouter.get('/sets.csv', async (_req, res) => {
  const b = await db.select().from(bands);
  const bandName = new Map(b.map((x) => [x.id, x.name]));

  const rows = await db
    .select({ s: sets, session: sessions, ex: exercises, se: sessionExercises })
    .from(sets)
    .innerJoin(sessions, eq(sessions.id, sets.sessionId))
    .innerJoin(exercises, eq(exercises.id, sets.exerciseId))
    .innerJoin(sessionExercises, eq(sessionExercises.id, sets.sessionExerciseId))
    .where(eq(sets.done, true))
    .orderBy(asc(sessions.day), asc(sessions.id), asc(sessionExercises.position), asc(sets.position));

  const header = [
    'data',
    'treino',
    'exercicio',
    'serie',
    'reps',
    'segundos',
    'elasticos',
    'ajuste_da_carga',
    'ajuste_pct',
    'peso_kg',
    'carga_estimada_kg',
    'rpe',
    'obs_serie',
    'obs_exercicio',
    'obs_treino',
  ];
  const lines = [header.join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.session.day,
        r.session.name,
        r.ex.name,
        r.s.position + 1,
        r.s.reps,
        r.s.seconds,
        r.s.bandIds.map((id) => bandName.get(id) ?? `#${id}`).join(' + '),
        r.s.setup,
        r.s.adjustPct,
        r.s.weightKg,
        r.s.loadKg != null ? String(r.s.loadKg).replace('.', ',') : null,
        r.s.rpe,
        r.s.notes,
        r.se.notes,
        r.session.notes,
      ]
        .map(csvCell)
        .join(';'),
    );
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="galaxy-health-series.csv"');
  // BOM para o Excel reconhecer UTF-8 (acentos).
  res.send('﻿' + lines.join('\r\n'));
});

/** Backup completo de todas as tabelas, em JSON. */
exportRouter.get('/backup.json', async (_req, res) => {
  const data = {
    exportedAt: new Date().toISOString(),
    version: 1,
    bands: await db.select().from(bands),
    exercises: await db.select().from(exercises),
    workouts: await db.select().from(workouts),
    workoutItems: await db.select().from(workoutItems),
    program: await db.select().from(program),
    sessions: await db.select().from(sessions),
    sessionExercises: await db.select().from(sessionExercises),
    sets: await db.select().from(sets),
    checkins: await db.select().from(checkins),
    bodyMetrics: await db.select().from(bodyMetrics),
  };
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="galaxy-health-backup-${stamp}.json"`);
  res.json(data);
});
