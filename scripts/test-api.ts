/**
 * Teste ponta a ponta da API contra um Postgres em memória (PGlite).
 * Não toca no banco real:  npm run test
 */
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import type { AddressInfo } from 'node:net';

process.env.DATABASE_URL = 'pglite';
process.env.PGLITE_DIR = ':memory:';
process.env.PASSCODE_HASH = bcrypt.hashSync('teste-123', 4);
process.env.SESSION_SECRET = 'x'.repeat(32);

const { createApp } = await import('../server/app.js');
const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
let cookie = '';

async function call<T = any>(method: string, path: string, body?: unknown, expect = 200): Promise<T> {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0]!;
  const text = await res.text();
  const data = text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  assert.equal(res.status, expect, `${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return data as T;
}

let passed = 0;
async function step(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

try {
  await step('bloqueia sem código e aceita o código certo', async () => {
    await call('GET', '/exercises', undefined, 401);
    await call('POST', '/auth/login', { passcode: 'errado' }, 401);
    await call('POST', '/auth/login', { passcode: 'teste-123' });
    assert.equal((await call('GET', '/auth/me')).authenticated, true);
  });

  const { bands } = await call('POST', '/bands/defaults', undefined, 201);
  const red = bands.find((b: any) => b.name === 'Vermelho');
  const black = bands.find((b: any) => b.name === 'Preto');

  let curl: any, pushup: any, stretch: any, workout: any;
  await step('cadastra exercícios com vídeos e padrões de carga', async () => {
    curl = await call(
      'POST',
      '/exercises',
      {
        name: 'Rosca bíceps pisando no elástico',
        kind: 'strength',
        muscleGroup: 'Bíceps',
        equipment: 'band',
        measure: 'reps',
        defaultSets: 3,
        defaultReps: 10,
        defaultBandIds: [red.id],
        videos: [{ url: 'https://youtu.be/abc', label: 'Execução' }],
      },
      201,
    );
    pushup = await call(
      'POST',
      '/exercises',
      { name: 'Flexão', kind: 'bodyweight', equipment: 'bodyweight', measure: 'reps' },
      201,
    );
    stretch = await call(
      'POST',
      '/exercises',
      { name: 'Posterior de coxa', kind: 'stretch', equipment: 'bodyweight', measure: 'time', perSide: true, defaultSeconds: 30 },
      201,
    );
    // PATCH parcial não pode zerar o resto.
    const patched = await call('PATCH', `/exercises/${curl.id}`, { notes: 'Cotovelo colado' });
    assert.equal(patched.videos.length, 1);
    assert.deepEqual(patched.defaultBandIds, [red.id]);
    assert.equal(patched.defaultSets, 3);
  });

  await step('monta treino A e programa semanal', async () => {
    workout = await call(
      'POST',
      '/workouts',
      {
        name: 'Braços',
        code: 'A',
        items: [
          { exerciseId: curl.id, targetSets: 2, targetReps: 10, targetRepsMax: 12 },
          { exerciseId: pushup.id, targetSets: 2, targetReps: 15 },
          { exerciseId: stretch.id, targetSets: 1, targetSeconds: 30 },
        ],
      },
      201,
    );
    assert.equal(workout.items.length, 3);
    await call('PUT', '/program', { mode: 'weekly', weekly: { '1': [workout.id] }, rotation: [] });
    const today = await call('GET', '/stats/today?day=2026-09-28&weekday=1');
    assert.equal(today.scheduled[0].id, workout.id);
  });

  let s1: any;
  await step('sessão 1: séries com elástico, ajuste escrito e observações', async () => {
    s1 = await call('POST', '/sessions', { workoutId: workout.id, day: '2026-09-21' }, 201);
    assert.equal(s1.exercises.length, 3);
    const c = s1.exercises[0];
    assert.equal(c.sets.length, 2);
    assert.deepEqual(c.sets[0].bandIds, [red.id], 'carga padrão do exercício');
    for (const set of c.sets) {
      await call('PATCH', `/sets/${set.id}`, { reps: 12, done: true, setup: 'pés na largura do quadril' });
    }
    await call('PATCH', `/session-exercises/${c.id}`, { notes: 'Fácil demais' });
    const p = s1.exercises[1];
    await call('PATCH', `/sets/${p.sets[0].id}`, { reps: 15, done: true, notes: 'Última rep arrastada' });
    await call('PATCH', `/sets/${p.sets[1].id}`, { reps: 13 }); // sem ✓: conta ao encerrar
    await call('PATCH', `/sessions/${s1.session.id}`, { notes: 'Dormi mal', rpe: 7 });
    const fin = await call('POST', `/sessions/${s1.session.id}/finish`, { status: 'completed', durationMs: 1800000 });
    assert.equal(fin.status, 'completed');
    const full = await call('GET', `/sessions/${s1.session.id}`);
    assert.equal(full.exercises[1].sets.length, 2);
    assert.equal(full.exercises[2].status, 'skipped', 'alongamento não feito = pulado');
  });

  await step('sessão 2 herda a carga da última vez, detecta recorde e compara', async () => {
    const s2 = await call('POST', '/sessions', { workoutId: workout.id, day: '2026-09-28' }, 201);
    const c = s2.exercises[0];
    assert.equal(c.previous.day, '2026-09-21');
    assert.equal(c.previous.sets[0].setup, 'pés na largura do quadril');
    assert.equal(c.suggestion?.level, 'almost', 'bateu o topo da faixa uma vez');
    assert.equal(c.sets[0].setup, 'pés na largura do quadril', 'setup copiado');

    // Sobe de carga: preto + ajuste escrito à mão com +10% estimado.
    const r = await call('PATCH', `/sets/${c.sets[0].id}`, {
      bandIds: [black.id],
      setup: 'Nó na ponta',
      adjustPct: 10,
      reps: 10,
      done: true,
    });
    assert.equal(r.record, 'load');
    assert.equal(r.set.loadKg, 22); // (11+29)/2 × 1,10
    // Mesmo texto com caixa/espaços diferentes conta como a mesma carga.
    await call('PATCH', `/sets/${c.sets[1].id}`, { bandIds: [black.id], setup: '  nó na  ponta ', adjustPct: 10, reps: 9, done: true });
    const setups = await call('GET', `/exercises/${curl.id}/setups`);
    assert.ok(setups.setups.includes('pés na largura do quadril'), 'sugere ajustes já usados');

    const p = s2.exercises[1];
    const pr = await call('PATCH', `/sets/${p.sets[0].id}`, { reps: 18, done: true });
    assert.equal(pr.record, 'reps');

    const s = s2.exercises[2];
    await call('PATCH', `/sets/${s.sets[0].id}`, { seconds: 40, done: true });

    await call('POST', `/sessions/${s2.session.id}/finish`, { status: 'completed', durationMs: 1500000 });
    const cmp = await call('GET', `/sessions/${s2.session.id}/compare`);
    assert.equal(cmp.previousSession.id, s1.session.id);
    const rowCurl = cmp.rows.find((x: any) => x.exerciseId === curl.id);
    assert.equal(rowCurl.trends.load, 'up');
    assert.equal(rowCurl.trends.reps, 'down');
    const rowPush = cmp.rows.find((x: any) => x.exerciseId === pushup.id);
    assert.equal(rowPush.trends.bestReps, 'up');
    const rowStretch = cmp.rows.find((x: any) => x.exerciseId === stretch.id);
    assert.equal(rowStretch.change, 'added');
  });

  await step('histórico e recordes por combinação de carga', async () => {
    const h = await call('GET', `/exercises/${curl.id}/history`);
    assert.equal(h.entries.length, 2);
    assert.equal(h.records.length, 2);
    assert.equal(h.records[0].loadKg, 22);
  });

  await step('sequência livre avança ao concluir', async () => {
    const b = await call('POST', '/workouts', { name: 'Pernas', code: 'B' }, 201);
    await call('PUT', '/program', { mode: 'rotation', weekly: {}, rotation: [workout.id, b.id, null] });
    const s = await call('POST', '/sessions', { workoutId: workout.id, day: '2026-09-29' }, 201);
    await call('POST', `/sessions/${s.session.id}/finish`, { status: 'completed', durationMs: 1 });
    const today = await call('GET', '/stats/today?day=2026-09-30&weekday=3');
    assert.equal(today.program.rotationIndex, 1);
    assert.equal(today.scheduled[0].id, b.id);
    assert.equal(today.upcoming[1].workout, null, 'descanso');
  });

  await step('check-in de alongamento, sequência de dias, calendário e medidas', async () => {
    await call('POST', '/checkins', { exerciseId: stretch.id, day: '2026-09-30', seconds: 60 }, 201);
    const today = await call('GET', '/stats/today?day=2026-09-30&weekday=3');
    assert.equal(today.checkins.length, 1);
    assert.equal(today.streak, 3);
    const cal = await call('GET', '/stats/calendar?from=2026-09-01&to=2026-09-30');
    assert.equal(cal.days.length, 4);
    await call('POST', '/body', { day: '2026-09-30', weightKg: 80.5 }, 201);
  });

  await step('duplica treino, arquiva o que tem histórico e exporta', async () => {
    const dup = await call('POST', `/workouts/${workout.id}/duplicate`, undefined, 201);
    assert.equal(dup.items.length, 3);
    assert.equal((await call('DELETE', `/workouts/${workout.id}`)).archived, true);
    assert.equal((await call('DELETE', `/bands/${red.id}`)).archived, true);
    const csv = await call<string>('GET', '/export/sets.csv');
    assert.match(csv, /Preto;Nó na ponta;10/);
    const backup = await call('GET', '/export/backup.json');
    assert.ok(backup.sets.length >= 7);
  });

  await step('grupos, subcategorias e mudança em lote', async () => {
    const peito = await call('POST', '/muscle-groups', { name: 'Peitoral' }, 201);
    const sup = await call('POST', '/muscle-groups', { name: 'Peitoral superior', parentId: peito.id }, 201);
    await call('POST', '/muscle-groups', { name: 'peitoral SUPERIOR', parentId: peito.id }, 409);
    await call('POST', '/muscle-groups', { name: 'Neto', parentId: sup.id }, 400);
    const ex = await call('POST', '/exercises', { name: 'Supino inclinado', kind: 'strength', equipment: 'band', measure: 'reps', muscleGroupId: peito.id }, 201);
    assert.equal((await call('POST', '/exercises/bulk-group', { ids: [ex.id], muscleGroupId: sup.id })).updated, 1);
    const g = await call('GET', '/muscle-groups');
    assert.equal(g.groups.find((x: any) => x.id === sup.id).exerciseCount, 1);
    // Apagar a subcategoria devolve o exercício ao grupo pai.
    await call('DELETE', `/muscle-groups/${sup.id}`);
    const after = (await call('GET', '/exercises')).exercises.find((x: any) => x.id === ex.id);
    assert.equal(after.muscleGroupId, peito.id);
  });

  await step('descanso por série e tempo estimado', async () => {
    const a = await call('POST', '/exercises', { name: 'Remada', kind: 'strength', equipment: 'band', measure: 'reps', restSeconds: 60 }, 201);
    const p = await call('POST', '/exercises', { name: 'Prancha', kind: 'bodyweight', equipment: 'bodyweight', measure: 'time', defaultSeconds: 40 }, 201);
    const w = await call('POST', '/workouts', {
      name: 'Teste tempo',
      items: [
        { exerciseId: a.id, targetSets: 3, targetReps: 10, restSeconds: 60, restPerSet: [90, 120, null] },
        { exerciseId: p.id, targetSets: 2, targetSeconds: 40, restSeconds: 30 },
      ],
    }, 201);
    assert.deepEqual(w.items[0].restPerSet, [90, 120, null]);
    // Remada: 3×30s + 90 + 120 + 60 = 360 · Prancha: 2×40s + 30 (o descanso da última série não conta) = 110 → 470 s
    const list = await call('GET', '/workouts');
    assert.equal(list.workouts.find((x: any) => x.id === w.id).estimatedSeconds, 470);
    const today = await call('GET', '/stats/today?day=2026-10-01&weekday=4');
    assert.equal(today.workouts.find((x: any) => x.id === w.id).estimatedSeconds, 470);
    const s = await call('POST', '/sessions', { workoutId: w.id, day: '2026-10-01' }, 201);
    assert.deepEqual(s.exercises[0].sets.map((x: any) => x.restSeconds), [90, 120, 60]);
    const r = await call('PATCH', `/sets/${s.exercises[0].sets[0].id}`, { restSeconds: 45 });
    assert.equal(r.set.restSeconds, 45);
    const extra = await call('POST', `/session-exercises/${s.exercises[0].id}/sets`, undefined, 201);
    assert.equal(extra.restSeconds, 60, 'série extra copia o descanso da última');
  });

  console.log(`\n  ${passed} cenários ok\n`);
} finally {
  server.close();
}
process.exit(0);
