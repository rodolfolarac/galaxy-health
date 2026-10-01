import type * as S from '../../server/db/schema';
import type { ExercisePerf, Trend } from '../../shared/load';

/** Como os tipos do banco chegam pelo JSON: datas viram string. */
type Json<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export type { ExercisePerf, Trend };
export type VideoLink = S.VideoLink;
export type Band = Json<S.Band>;
export type MuscleGroup = Json<S.MuscleGroup> & { exerciseCount: number };
export type Exercise = Json<S.Exercise> & { timesDone?: number; lastDay?: string | null };
export type WorkoutItem = Json<S.WorkoutItem>;
export type Workout = Json<S.Workout> & { items: WorkoutItem[]; lastDay?: string | null; estimatedSeconds: number };
export type WorkoutLite = Json<S.Workout> & { itemCount: number; estimatedSeconds: number };
export type Program = Json<S.Program>;
export type Session = Json<S.Session>;
export type SessionListItem = Session & {
  exercisesDone: number;
  exercisesSkipped: number;
  exercisesTotal: number;
  setsDone: number;
  repsDone: number;
};
export type SetRow = Json<S.SetRow>;
export type Checkin = Json<S.Checkin>;
export type BodyMetric = Json<S.BodyMetric>;

export type ExerciseKind = 'strength' | 'stretch' | 'mobility' | 'bodyweight' | 'cardio';

export type Previous = {
  sessionId: number;
  day: string;
  sessionName: string;
  notes: string | null;
  status: string;
  sets: SetRow[];
  perf: ExercisePerf;
};

export type Suggestion = { level: 'up' | 'almost'; text: string };

export type SessionExercise = Json<S.SessionExercise> & {
  exercise: Exercise;
  sets: SetRow[];
  previous: Previous | null;
  suggestion: Suggestion | null;
};

export type SessionFull = { session: Session; exercises: SessionExercise[] };

export type Today = {
  day: string;
  program: Program;
  scheduled: WorkoutLite[];
  upcoming: { index: number; workout: WorkoutLite | null }[];
  workouts: WorkoutLite[];
  active: Session[];
  sessions: Session[];
  checkins: Checkin[];
  streak: number;
  week: { sessions: number; sets: number };
};

type Block = {
  exerciseId: number;
  name: string;
  measure: string;
  status: string | null;
  notes: string | null;
  sets: SetRow[];
  perf: ExercisePerf | null;
};

export type CompareRow = {
  exerciseId: number;
  name: string;
  measure: string;
  current: Block | null;
  previous: Block | null;
  trends: Record<'sets' | 'reps' | 'bestReps' | 'seconds' | 'load' | 'volume', Trend>;
  change: 'skipped' | 'added' | 'first' | 'none' | 'both';
};

export type Comparison = {
  session: Session;
  previousSession: Session | null;
  rows: CompareRow[];
  totals: {
    current: ExercisePerf & { exercises: number };
    previous: (ExercisePerf & { exercises: number }) | null;
  };
};

export type HistoryEntry = {
  sessionExerciseId: number;
  status: string;
  notes: string | null;
  sessionId: number;
  day: string;
  sessionName: string;
  color: string;
  sets: SetRow[];
  perf: ExercisePerf;
};

export type RecordRow = {
  key: string;
  bandIds: number[];
  setup: string | null;
  weightKg: number | null;
  loadKg: number | null;
  bestReps: number;
  bestSeconds: number;
  day: string;
};

export type CalendarDay = {
  day: string;
  sessions: { id: number; name: string; color: string }[];
  checkins: number;
};
