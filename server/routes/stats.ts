import { Router } from 'express';
import { and, asc, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { checkins, sessions, sets, workoutItems, workouts } from '../db/schema.js';
import { estimateSeconds, planSets } from '../../shared/estimate.js';
import { dayQuery, HttpError } from '../lib/http.js';
import { exerciseMap, getProgram } from './workouts.js';
import { finalizeStaleSessions } from '../lib/sessionOps.js';

export const statsRouter = Router();

function shiftDay(day: string, delta: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Sessão "conta" como feita se foi concluída ou se tem alguma série feita —
 * o treino em pedaços ao longo do dia fica aberto até a virada do dia.
 */
const sessionCounts = sql`(${sessions.status} = 'completed' or (${sessions.status} = 'active' and exists (select 1 from ${sets} where ${sets.sessionId} = ${sessions.id} and ${sets.done})))`;

/** Dias (YYYY-MM-DD) com algum treino feito ou check-in. */
async function activeDays(from: string, to: string) {
  const s = await db
    .selectDistinct({ day: sessions.day })
    .from(sessions)
    .where(and(sessionCounts, gte(sessions.day, from), lte(sessions.day, to)));
  const c = await db
    .selectDistinct({ day: checkins.day })
    .from(checkins)
    .where(and(gte(checkins.day, from), lte(checkins.day, to)));
  return new Set([...s.map((r) => r.day), ...c.map((r) => r.day)]);
}

/** Sequência de dias ativos até hoje (se hoje ainda não teve, conta até ontem). */
async function streakUntil(today: string) {
  const days = await activeDays(shiftDay(today, -400), today);
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = shiftDay(cursor, -1);
  }
  return n;
}

/**
 * Tudo que a tela "Hoje" precisa numa chamada: o que está programado para
 * hoje, sessões em andamento, o que já foi feito no dia e a sequência.
 */
statsRouter.get('/today', async (req, res) => {
  const day = dayQuery(req);
  await finalizeStaleSessions(day);
  const weekday = Number(req.query.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new HttpError(400, 'weekday inválido.');
  }

  const p = await getProgram();
  const all = await db
    .select()
    .from(workouts)
    .where(eq(workouts.archived, false))
    .orderBy(asc(workouts.sortOrder), asc(workouts.id));
  const items = await db.select().from(workoutItems).orderBy(asc(workoutItems.position));
  const exById = await exerciseMap();
  const lite = all.map((w) => {
    const mine = items.filter((it) => it.workoutId === w.id);
    return { ...w, itemCount: mine.length, estimatedSeconds: estimateSeconds(planSets(mine, exById)) };
  });
  const byId = new Map(lite.map((w) => [w.id, w]));

  let scheduled: typeof lite = [];
  let upcoming: ({ index: number; workout: (typeof lite)[number] | null })[] = [];
  if (p.mode === 'weekly') {
    scheduled = (p.weekly[String(weekday)] ?? []).map((id) => byId.get(id)).filter((w) => !!w);
  } else if (p.rotation.length) {
    const len = p.rotation.length;
    for (let i = 0; i < Math.min(len, 5); i++) {
      const index = (p.rotationIndex + i) % len;
      const id = p.rotation[index];
      upcoming.push({ index, workout: id ? (byId.get(id) ?? null) : null });
    }
    const cur = upcoming[0]?.workout;
    if (cur) scheduled = [cur];
  }

  const active = await db
    .select()
    .from(sessions)
    .where(eq(sessions.status, 'active'))
    .orderBy(desc(sessions.startedAt));
  const todays = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.day, day), sessionCounts))
    .orderBy(asc(sessions.startedAt));

  // Progresso de cada treino hoje: séries feitas por exercício, para a tela
  // mostrar "Prancha 2/3" e permitir registrar a próxima série solta.
  const dayRows = await db
    .select({ sessionId: sets.sessionId, workoutId: sessions.workoutId, exerciseId: sets.exerciseId, at: sets.completedAt })
    .from(sets)
    .innerJoin(sessions, eq(sessions.id, sets.sessionId))
    .where(and(eq(sessions.day, day), eq(sets.done, true), ne(sessions.status, 'aborted')));
  // Sessão do dia de cada treino (a mais recente não interrompida): abrir o
  // treino completo continua essa, em vez de criar outra.
  const daySessionRows = await db
    .select({ id: sessions.id, workoutId: sessions.workoutId })
    .from(sessions)
    .where(and(eq(sessions.day, day), ne(sessions.status, 'aborted')))
    .orderBy(asc(sessions.id));
  const daySessions: Record<string, number> = {};
  for (const r of daySessionRows) if (r.workoutId) daySessions[r.workoutId] = r.id;

  const progress: Record<string, Record<string, { done: number; lastAt: string | null }>> = {};
  for (const r of dayRows) {
    if (!r.workoutId) continue;
    const w = (progress[r.workoutId] ??= {});
    const e = (w[r.exerciseId] ??= { done: 0, lastAt: null });
    e.done++;
    const at = r.at ? r.at.toISOString() : null;
    if (at && (!e.lastAt || at > e.lastAt)) e.lastAt = at;
  }
  const todaysCheckins = await db
    .select()
    .from(checkins)
    .where(eq(checkins.day, day))
    .orderBy(asc(checkins.createdAt));

  const weekFrom = shiftDay(day, -6);
  const [week] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sessions)
    .where(and(sessionCounts, gte(sessions.day, weekFrom), lte(sessions.day, day)));
  const [weekSets] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sets)
    .innerJoin(sessions, eq(sessions.id, sets.sessionId))
    .where(and(eq(sets.done, true), gte(sessions.day, weekFrom), lte(sessions.day, day)));

  res.json({
    day,
    program: p,
    scheduled,
    upcoming,
    workouts: lite,
    active,
    sessions: todays,
    progress,
    daySessions,
    checkins: todaysCheckins,
    streak: await streakUntil(day),
    week: { sessions: Number(week?.n ?? 0), sets: Number(weekSets?.n ?? 0) },
  });
});

/** Mapa de calor: o que foi feito em cada dia do intervalo. */
statsRouter.get('/calendar', async (req, res) => {
  const from = dayQuery(req, 'from');
  const to = dayQuery(req, 'to');
  const s = await db
    .select({ day: sessions.day, name: sessions.name, color: sessions.color, id: sessions.id })
    .from(sessions)
    .where(and(sessionCounts, gte(sessions.day, from), lte(sessions.day, to)));
  const c = await db
    .select({ day: checkins.day, n: sql<number>`count(*)` })
    .from(checkins)
    .where(and(gte(checkins.day, from), lte(checkins.day, to)))
    .groupBy(checkins.day);

  const map = new Map<
    string,
    { day: string; sessions: { id: number; name: string; color: string }[]; checkins: number }
  >();
  const get = (day: string) => {
    let v = map.get(day);
    if (!v) {
      v = { day, sessions: [], checkins: 0 };
      map.set(day, v);
    }
    return v;
  };
  for (const r of s) get(r.day).sessions.push({ id: r.id, name: r.name, color: r.color });
  for (const r of c) get(r.day).checkins = Number(r.n);
  res.json({ days: [...map.values()].sort((a, b) => a.day.localeCompare(b.day)) });
});
