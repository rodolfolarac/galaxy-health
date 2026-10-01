import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useCatalog } from '../lib/catalog';
import type { Exercise, MuscleGroup } from '../lib/types';
import { Button, Input, Select } from './ui';

export type GroupFilterValue = { groupId: number | null; subId: number | 'none' | null };
export const EMPTY_GROUP_FILTER: GroupFilterValue = { groupId: null, subId: null };

/**
 * O exercício passa no filtro? Com só o grupo escolhido, entram o grupo e
 * todas as subcategorias dele; com a subcategoria, só ela; "none" = exercícios
 * do grupo que ainda não têm subcategoria.
 */
export function matchesGroup(
  e: Pick<Exercise, 'muscleGroupId'>,
  f: GroupFilterValue,
  groupById: Map<number, MuscleGroup>,
) {
  if (!f.groupId) return true;
  const g = e.muscleGroupId ? groupById.get(e.muscleGroupId) : undefined;
  if (!g) return false;
  const top = g.parentId ?? g.id;
  if (top !== f.groupId) return false;
  if (f.subId === 'none') return !g.parentId;
  if (f.subId) return g.id === f.subId;
  return true;
}

/** Dois seletores lado a lado: grupo muscular e subcategoria. */
export function GroupFilter({
  value,
  onChange,
  className,
}: {
  value: GroupFilterValue;
  onChange: (v: GroupFilterValue) => void;
  className?: string;
}) {
  const { groupTree } = useCatalog();
  const current = groupTree.find((g) => g.id === value.groupId);
  if (!groupTree.length) return null;
  return (
    <div className={className ?? 'flex flex-wrap gap-2'}>
      <Select
        aria-label="Grupo muscular"
        value={value.groupId ?? ''}
        onChange={(e) => onChange({ groupId: e.target.value ? Number(e.target.value) : null, subId: null })}
        className="w-auto"
      >
        <option value="">Todos os grupos</option>
        {groupTree.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </Select>
      {current && current.children.length > 0 && (
        <Select
          aria-label="Subcategoria"
          value={value.subId ?? ''}
          onChange={(e) =>
            onChange({
              ...value,
              subId: e.target.value === 'none' ? 'none' : e.target.value ? Number(e.target.value) : null,
            })
          }
          className="w-auto"
        >
          <option value="">Todas as subcategorias</option>
          {current.children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="none">Sem subcategoria</option>
        </Select>
      )}
    </div>
  );
}

const NEW = '__new__';

/**
 * Escolha do grupo/subcategoria no cadastro do exercício, com criação na
 * hora ("+ Nova subcategoria…") sem sair da tela.
 */
export function GroupPicker({
  value,
  onChange,
}: {
  value: number | null | undefined;
  onChange: (id: number | null) => void;
}) {
  const { groupTree, groupById, refresh } = useCatalog();
  const sel = value ? groupById.get(value) : undefined;
  const topId = sel ? (sel.parentId ?? sel.id) : null;
  const top = groupTree.find((g) => g.id === topId);
  const [creating, setCreating] = useState<'group' | 'sub' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    try {
      const g = await api.createMuscleGroup({ name: name.trim(), parentId: creating === 'sub' ? topId : null });
      await refresh(['groups']);
      onChange(g.id);
      setCreating(null);
      setName('');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar.');
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          aria-label="Grupo muscular"
          value={topId ?? ''}
          onChange={(e) => {
            if (e.target.value === NEW) return setCreating('group');
            onChange(e.target.value ? Number(e.target.value) : null);
          }}
        >
          <option value="">Sem grupo</option>
          {groupTree.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          <option value={NEW}>+ Novo grupo…</option>
        </Select>
        {top && (
          <Select
            aria-label="Subcategoria"
            value={sel?.parentId ? sel.id : ''}
            onChange={(e) => {
              if (e.target.value === NEW) return setCreating('sub');
              onChange(e.target.value ? Number(e.target.value) : top.id);
            }}
          >
            <option value="">Sem subcategoria</option>
            {top.children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW}>+ Nova subcategoria…</option>
          </Select>
        )}
      </div>
      {creating && (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), create())}
            placeholder={creating === 'sub' ? `Nova subcategoria de ${top?.name}` : 'Novo grupo muscular'}
          />
          <Button type="button" onClick={create} aria-label="Criar">
            <Check className="size-4" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCreating(null)} aria-label="Cancelar">
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-rose-300">{error}</p>}
    </div>
  );
}

/** Ajustes → grupos musculares e as subcategorias de cada um. */
export function MuscleGroupsSettings() {
  const { groupTree, refresh } = useCatalog();
  const [newGroup, setNewGroup] = useState('');
  const [newSub, setNewSub] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    try {
      setError(null);
      await fn();
      await refresh(['groups', 'exercises']);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }

  const rename = (g: MuscleGroup) => {
    const name = window.prompt('Novo nome', g.name)?.trim();
    if (name && name !== g.name) run(() => api.updateMuscleGroup(g.id, { name }));
  };

  const remove = (g: MuscleGroup, isSub: boolean) => {
    const msg = isSub
      ? `Apagar a subcategoria “${g.name}”? Os ${g.exerciseCount} exercícios dela voltam para o grupo.`
      : `Apagar o grupo “${g.name}” e todas as subcategorias? Os exercícios ficam sem grupo.`;
    if (window.confirm(msg)) run(() => api.deleteMuscleGroup(g.id));
  };

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {groupTree.map((g) => {
        const total = g.exerciseCount + g.children.reduce((a, c) => a + c.exerciseCount, 0);
        return (
          <div key={g.id} className="glass rounded-2xl p-3">
            <div className="flex items-center gap-2">
              <p className="flex-1 font-medium">
                {g.name} <span className="text-xs font-normal text-faint">· {total} exercícios</span>
              </p>
              <button onClick={() => rename(g)} aria-label={`Renomear ${g.name}`} className="rounded p-1.5 text-faint hover:text-starlight">
                <Pencil className="size-4" aria-hidden />
              </button>
              <button onClick={() => remove(g, false)} aria-label={`Apagar ${g.name}`} className="rounded p-1.5 text-faint hover:text-rose-300">
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {g.children.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-ridge bg-black/20 py-0.5 pr-1 pl-2.5 text-xs">
                  <button onClick={() => rename(c)} className="hover:text-starlight" title="Renomear">
                    {c.name}
                  </button>
                  <span className="text-faint">{c.exerciseCount}</span>
                  <button onClick={() => remove(c, true)} aria-label={`Apagar ${c.name}`} className="rounded-full p-0.5 text-faint hover:text-rose-300">
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
              <form
                className="inline-flex"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newSub[g.id]?.trim();
                  if (!name) return;
                  run(() => api.createMuscleGroup({ name, parentId: g.id })).then(() => setNewSub((s) => ({ ...s, [g.id]: '' })));
                }}
              >
                <Input
                  value={newSub[g.id] ?? ''}
                  onChange={(e) => setNewSub((s) => ({ ...s, [g.id]: e.target.value }))}
                  placeholder="+ subcategoria"
                  aria-label={`Nova subcategoria de ${g.name}`}
                  className="w-40 rounded-full px-3 py-1 text-xs"
                />
              </form>
            </div>
          </div>
        );
      })}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newGroup.trim()) return;
          run(() => api.createMuscleGroup({ name: newGroup.trim() })).then(() => setNewGroup(''));
        }}
      >
        <Input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Novo grupo muscular" className="max-w-xs" />
        <Button type="submit" variant="outline" disabled={!newGroup.trim()}>
          <Plus className="size-4" aria-hidden /> Grupo
        </Button>
      </form>
    </div>
  );
}
