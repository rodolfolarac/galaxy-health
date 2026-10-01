import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { estimateLoad, type LoadInput } from '../../shared/load';
import { api } from './api';
import type { Band, Exercise, MuscleGroup, Workout } from './types';

type Catalog = {
  ready: boolean;
  bands: Band[];
  groups: MuscleGroup[];
  /** Grupos de topo, cada um com as subcategorias, na ordem cadastrada. */
  groupTree: (MuscleGroup & { children: MuscleGroup[] })[];
  groupById: Map<number, MuscleGroup>;
  /** "Peitoral › Superior" ou "Peitoral". */
  groupLabel: (id: number | null | undefined) => string | null;
  exercises: Exercise[];
  workouts: Workout[];
  bandById: Map<number, Band>;
  exerciseById: Map<number, Exercise>;
  estimate: (input: LoadInput) => number | null;
  refresh: (what?: ('bands' | 'groups' | 'exercises' | 'workouts')[]) => Promise<void>;
};

const Ctx = createContext<Catalog | null>(null);

/**
 * Elásticos, exercícios e treinos ficam carregados uma vez e são
 * compartilhados por todas as telas — a sessão de treino usa tudo isso a
 * cada série.
 */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [bands, setBands] = useState<Band[]>([]);
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);

  const refresh = useCallback<Catalog['refresh']>(async (what) => {
    const all = !what;
    const want = new Set(what ?? []);
    await Promise.all([
      (all || want.has('bands')) && api.bands().then((r) => setBands(r.bands)),
      (all || want.has('groups')) && api.muscleGroups().then((r) => setGroups(r.groups)),
      (all || want.has('exercises')) && api.exercises().then((r) => setExercises(r.exercises)),
      (all || want.has('workouts')) && api.workouts().then((r) => setWorkouts(r.workouts)),
    ]);
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => {})
      .finally(() => setReady(true));
  }, [refresh]);

  const value = useMemo<Catalog>(() => {
    const bandById = new Map(bands.map((b) => [b.id, b]));
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const groupTree = groups
      .filter((g) => !g.parentId)
      .map((g) => ({ ...g, children: groups.filter((c) => c.parentId === g.id) }));
    return {
      ready,
      bands,
      groups,
      groupTree,
      groupById,
      groupLabel: (id) => {
        const g = id ? groupById.get(id) : undefined;
        if (!g) return null;
        const parent = g.parentId ? groupById.get(g.parentId) : undefined;
        return parent ? `${parent.name} › ${g.name}` : g.name;
      },
      exercises,
      workouts,
      bandById,
      exerciseById: new Map(exercises.map((e) => [e.id, e])),
      estimate: (input) => estimateLoad(input, bandById),
      refresh,
    };
  }, [ready, bands, groups, exercises, workouts, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalog() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCatalog fora do CatalogProvider');
  return c;
}
