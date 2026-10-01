import type {
  Band,
  BodyMetric,
  CalendarDay,
  Checkin,
  Comparison,
  Exercise,
  HistoryEntry,
  MuscleGroup,
  Program,
  RecordRow,
  Session,
  SessionExercise,
  SessionFull,
  SessionListItem,
  SetRow,
  Today,
  Workout,
  WorkoutItem,
} from './types';

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Disparado quando a sessão expira — o App volta para a tela de código. */
export const UNAUTHORIZED_EVENT = 'gh:unauthorized';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    throw new ApiError('Sem conexão. Verifique a internet e tente de novo.', 0);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!res.ok) throw new ApiError(data?.error ?? `Erro ${res.status}`, res.status);
  return data as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
const del = <T = { deleted?: boolean; archived?: boolean }>(path: string) =>
  request<T>(path, { method: 'DELETE' });

export { ApiError };

export type WorkoutItemInput = Omit<WorkoutItem, 'id' | 'workoutId' | 'position'>;
export type WorkoutInput = Partial<Omit<Workout, 'id' | 'items' | 'createdAt' | 'updatedAt' | 'estimatedSeconds'>> & {
  items?: WorkoutItemInput[];
};
export type ExerciseInput = Partial<Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'timesDone' | 'lastDay' | 'muscleGroup'>>;
export type SetPatch = Partial<
  Pick<SetRow, 'reps' | 'seconds' | 'weightKg' | 'bandIds' | 'setup' | 'adjustPct' | 'rpe' | 'notes' | 'done' | 'restSeconds'>
>;

export const api = {
  // ── acesso ──
  me: () => request<{ authenticated: boolean }>('/auth/me'),
  login: (passcode: string) => post<{ authenticated: boolean }>('/auth/login', { passcode }),
  logout: () => post<unknown>('/auth/logout'),

  // ── elásticos ──
  bands: () => request<{ bands: Band[] }>('/bands'),
  createBand: (b: Partial<Band>) => post<Band>('/bands', b),
  updateBand: (id: number, b: Partial<Band>) => patch<Band>(`/bands/${id}`, b),
  deleteBand: (id: number) => del(`/bands/${id}`),
  seedBands: () => post<{ bands: Band[] }>('/bands/defaults'),

  // ── grupos musculares ──
  muscleGroups: () => request<{ groups: MuscleGroup[] }>('/muscle-groups'),
  createMuscleGroup: (g: { name: string; parentId?: number | null }) => post<MuscleGroup>('/muscle-groups', g),
  updateMuscleGroup: (id: number, g: { name?: string; parentId?: number | null; sortOrder?: number }) =>
    patch<MuscleGroup>(`/muscle-groups/${id}`, g),
  deleteMuscleGroup: (id: number) => del(`/muscle-groups/${id}`),
  bulkGroup: (ids: number[], muscleGroupId: number | null) =>
    post<{ updated: number }>('/exercises/bulk-group', { ids, muscleGroupId }),

  // ── exercícios ──
  exercises: () => request<{ exercises: Exercise[] }>('/exercises'),
  createExercise: (e: ExerciseInput) => post<Exercise>('/exercises', e),
  updateExercise: (id: number, e: ExerciseInput) => patch<Exercise>(`/exercises/${id}`, e),
  deleteExercise: (id: number) => del(`/exercises/${id}`),
  exerciseSetups: (id: number) => request<{ setups: string[] }>(`/exercises/${id}/setups`),
  exerciseHistory: (id: number) =>
    request<{ entries: HistoryEntry[]; records: RecordRow[] }>(`/exercises/${id}/history`),

  // ── treinos e programa ──
  workouts: () => request<{ workouts: Workout[] }>('/workouts'),
  createWorkout: (w: WorkoutInput) => post<Workout>('/workouts', w),
  updateWorkout: (id: number, w: WorkoutInput) => patch<Workout>(`/workouts/${id}`, w),
  duplicateWorkout: (id: number) => post<Workout>(`/workouts/${id}/duplicate`),
  deleteWorkout: (id: number) => del(`/workouts/${id}`),
  program: () => request<Program>('/program'),
  saveProgram: (p: Pick<Program, 'mode' | 'weekly' | 'rotation' | 'rotationIndex'>) =>
    put<Program>('/program', p),
  setRotationIndex: (index: number) => post<Program>('/program/rotation-index', { index }),

  // ── hoje / estatísticas ──
  today: (day: string, weekday: number) =>
    request<Today>(`/stats/today?day=${day}&weekday=${weekday}`),
  calendar: (from: string, to: string) =>
    request<{ days: CalendarDay[] }>(`/stats/calendar?from=${from}&to=${to}`),

  // ── sessões ──
  startSession: (workoutId: number | null, day: string) =>
    post<SessionFull>('/sessions', { workoutId, day }),
  session: (id: number) => request<SessionFull>(`/sessions/${id}`),
  sessions: (q: { from?: string; to?: string; status?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v != null) qs.set(k, String(v));
    return request<{ sessions: SessionListItem[] }>(`/sessions?${qs}`);
  },
  updateSession: (
    id: number,
    body: Partial<Pick<Session, 'notes' | 'rpe' | 'energy' | 'pain' | 'durationMs' | 'day' | 'name'>>,
  ) => patch<Session>(`/sessions/${id}`, body),
  finishSession: (id: number, status: 'completed' | 'aborted', durationMs: number) =>
    post<Session>(`/sessions/${id}/finish`, { status, durationMs }),
  reopenSession: (id: number) => post<SessionFull>(`/sessions/${id}/reopen`),
  deleteSession: (id: number) => del(`/sessions/${id}`),
  compare: (id: number) => request<Comparison>(`/sessions/${id}/compare`),
  addSessionExercise: (sessionId: number, exerciseId: number) =>
    post<SessionFull>(`/sessions/${sessionId}/exercises`, { exerciseId }),
  updateSessionExercise: (
    id: number,
    body: Partial<Pick<SessionExercise, 'notes' | 'status' | 'position'>>,
  ) => patch<SessionExercise>(`/session-exercises/${id}`, body),
  deleteSessionExercise: (id: number) => del(`/session-exercises/${id}`),
  addSet: (sessionExerciseId: number) => post<SetRow>(`/session-exercises/${sessionExerciseId}/sets`),
  updateSet: (id: number, body: SetPatch) =>
    patch<{ set: SetRow; record: 'load' | 'reps' | null }>(`/sets/${id}`, body),
  deleteSet: (id: number) => del(`/sets/${id}`),

  // ── check-ins e medidas ──
  checkins: (from?: string, to?: string) =>
    request<{ checkins: Checkin[] }>(`/checkins?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`),
  createCheckin: (c: { exerciseId?: number | null; name?: string | null; day: string; seconds?: number | null; notes?: string | null }) =>
    post<Checkin>('/checkins', c),
  deleteCheckin: (id: number) => del(`/checkins/${id}`),
  body: () => request<{ metrics: BodyMetric[] }>('/body'),
  createBody: (b: Partial<BodyMetric> & { day: string }) => post<BodyMetric>('/body', b),
  deleteBody: (id: number) => del(`/body/${id}`),
};
