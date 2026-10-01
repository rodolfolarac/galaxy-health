import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  boolean,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export type VideoLink = { url: string; label?: string | null };

/**
 * Um elástico (superband). A carga de um elástico não é exata: a marca
 * informa uma faixa em kg por cor. O ponto médio dessa faixa alimenta a
 * "carga estimada" usada nas comparações.
 */
export const bands = pgTable('bands', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  /** Cor de exibição, em hex (#e11d48). */
  color: text('color').notNull(),
  brand: text('brand'),
  minKg: real('min_kg'),
  maxKg: real('max_kg'),
  notes: text('notes'),
  /** Ordem do mais leve para o mais pesado. */
  sortOrder: integer('sort_order').notNull().default(0),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Exercício do acervo. `kind` separa força, alongamento, mobilidade e
 * peso do corpo; `measure` diz se a série é contada em repetições ou em
 * segundos; `perSide` indica que a contagem é por lado.
 */
export const exercises = pgTable(
  'exercises',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    /** 'strength' | 'stretch' | 'mobility' | 'bodyweight' | 'cardio' */
    kind: text('kind').notNull().default('strength'),
    muscleGroup: text('muscle_group'),
    /** 'band' | 'bodyweight' | 'other' */
    equipment: text('equipment').notNull().default('band'),
    /** 'reps' | 'time' */
    measure: text('measure').notNull().default('reps'),
    perSide: boolean('per_side').notNull().default(false),

    defaultSets: integer('default_sets').notNull().default(3),
    defaultReps: integer('default_reps'),
    defaultSeconds: integer('default_seconds'),
    restSeconds: integer('rest_seconds').notNull().default(60),
    defaultBandIds: jsonb('default_band_ids').$type<number[]>().notNull().default([]),
    /** Como a carga costuma ser ajustada (texto livre: amarra, posição dos pés…). */
    defaultSetup: text('default_setup'),

    /** Como executar: postura, amplitude, respiração. */
    instructions: text('instructions'),
    notes: text('notes'),
    videos: jsonb('videos').$type<VideoLink[]>().notNull().default([]),

    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('exercises_kind_idx').on(t.kind)],
);

/** Treino (ficha): "A – Peito e tríceps", "Alongamento da manhã". */
export const workouts = pgTable('workouts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  /** Letra ou sigla curta mostrada em chips: A, B, C, ALG. */
  code: text('code'),
  color: text('color').notNull().default('#7c3aed'),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Um exercício dentro de um treino, com as metas daquele treino. */
export const workoutItems = pgTable(
  'workout_items',
  {
    id: serial('id').primaryKey(),
    workoutId: integer('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    targetSets: integer('target_sets').notNull().default(3),
    targetReps: integer('target_reps'),
    /** Topo da faixa (ex.: 8–12). Bater o topo em todas as séries sugere subir carga. */
    targetRepsMax: integer('target_reps_max'),
    targetSeconds: integer('target_seconds'),
    restSeconds: integer('rest_seconds'),
    /** Itens com o mesmo rótulo formam um bi-set / tri-set. */
    supersetGroup: text('superset_group'),
    bandIds: jsonb('band_ids').$type<number[]>().notNull().default([]),
    setup: text('setup'),
    notes: text('notes'),
  },
  (t) => [index('workout_items_workout_idx').on(t.workoutId)],
);

/**
 * Programa (linha única, id = 1). Dois modos:
 *  - weekly:   dia da semana (0 = domingo) → lista de treinos;
 *  - rotation: sequência livre (A B C A B…), `null` = descanso.
 */
export const program = pgTable('program', {
  id: integer('id').primaryKey(),
  mode: text('mode').notNull().default('weekly'),
  weekly: jsonb('weekly').$type<Record<string, number[]>>().notNull().default({}),
  rotation: jsonb('rotation').$type<(number | null)[]>().notNull().default([]),
  rotationIndex: integer('rotation_index').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Sessão = um treino executado num dia. `day` é a data local do usuário
 * (YYYY-MM-DD), enviada pelo navegador — o servidor roda em UTC.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    workoutId: integer('workout_id').references(() => workouts.id, { onDelete: 'set null' }),
    /** Nome congelado no momento do treino, para o histórico não mudar. */
    name: text('name').notNull(),
    color: text('color').notNull().default('#7c3aed'),
    day: text('day').notNull(),
    /** 'active' | 'completed' | 'aborted' */
    status: text('status').notNull().default('active'),
    durationMs: integer('duration_ms').notNull().default(0),
    notes: text('notes'),
    /** Esforço percebido 1–10. */
    rpe: integer('rpe'),
    /** Energia/disposição 1–5. */
    energy: integer('energy'),
    pain: text('pain'),
    /** Posição da sequência que esta sessão cumpre (modo rotation). */
    rotationSlot: integer('rotation_slot'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [index('sessions_day_idx').on(t.day), index('sessions_workout_idx').on(t.workoutId)],
);

/** Exercício dentro de uma sessão, com a observação daquele dia. */
export const sessionExercises = pgTable(
  'session_exercises',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    /** 'pending' | 'done' | 'skipped' */
    status: text('status').notNull().default('pending'),
    notes: text('notes'),
    targetSets: integer('target_sets'),
    targetReps: integer('target_reps'),
    targetRepsMax: integer('target_reps_max'),
    targetSeconds: integer('target_seconds'),
    restSeconds: integer('rest_seconds'),
    supersetGroup: text('superset_group'),
  },
  (t) => [
    index('session_ex_session_idx').on(t.sessionId),
    index('session_ex_exercise_idx').on(t.exerciseId),
  ],
);

/**
 * Série. A carga é a combinação de elásticos + peso opcional + a descrição
 * livre de como ela foi ajustada (`setup`: "amarra de 10 cm na ponta, pés
 * dois palmos além do ombro"). `adjustPct` é o efeito estimado desse ajuste,
 * opcional. `loadKg` é a estimativa calculada no servidor ao gravar.
 */
export const sets = pgTable(
  'sets',
  {
    id: serial('id').primaryKey(),
    sessionExerciseId: integer('session_exercise_id')
      .notNull()
      .references(() => sessionExercises.id, { onDelete: 'cascade' }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    reps: integer('reps'),
    seconds: integer('seconds'),
    weightKg: real('weight_kg'),
    bandIds: jsonb('band_ids').$type<number[]>().notNull().default([]),
    setup: text('setup'),
    adjustPct: real('adjust_pct'),
    loadKg: real('load_kg'),
    rpe: integer('rpe'),
    notes: text('notes'),
    done: boolean('done').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('sets_session_ex_idx').on(t.sessionExerciseId),
    index('sets_exercise_idx').on(t.exerciseId),
  ],
);

/** Check-in rápido: um alongamento avulso feito ao longo do dia. */
export const checkins = pgTable(
  'checkins',
  {
    id: serial('id').primaryKey(),
    exerciseId: integer('exercise_id').references(() => exercises.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    day: text('day').notNull(),
    seconds: integer('seconds'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('checkins_day_idx').on(t.day)],
);

/** Peso corporal e medidas. */
export const bodyMetrics = pgTable(
  'body_metrics',
  {
    id: serial('id').primaryKey(),
    day: text('day').notNull(),
    weightKg: real('weight_kg'),
    waistCm: real('waist_cm'),
    chestCm: real('chest_cm'),
    armCm: real('arm_cm'),
    thighCm: real('thigh_cm'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('body_day_idx').on(t.day)],
);

/**
 * Tentativas de login por IP. Fica no banco (e não em memória) porque na
 * Vercel cada instância serverless tem a própria memória.
 */
export const loginAttempts = pgTable('login_attempts', {
  ip: text('ip').primaryKey(),
  count: integer('count').notNull().default(0),
  until: timestamp('until', { withTimezone: true }).notNull(),
});

export type Band = typeof bands.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type WorkoutItem = typeof workoutItems.$inferSelect;
export type Program = typeof program.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SessionExercise = typeof sessionExercises.$inferSelect;
export type SetRow = typeof sets.$inferSelect;
export type Checkin = typeof checkins.$inferSelect;
export type BodyMetric = typeof bodyMetrics.$inferSelect;
