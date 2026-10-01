import { useState } from 'react';
import { Archive, Download, LogOut, Pencil, Plus, Smartphone, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useCatalog } from '../lib/catalog';
import { bandMidKg } from '../../shared/load';
import type { Band } from '../lib/types';
import { BandSwatch } from './Load';
import { MuscleGroupsSettings } from './MuscleGroups';
import { Button, cx, Field, Input, Modal, Notice, NumberInput, Panel, SectionTitle } from './ui';

const BAND_COLORS = ['#facc15', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#3b82f6', '#22c55e', '#52525b', '#f5f5f4'];

export function SettingsView({ onLogout }: { onLogout: () => void }) {
  const { bands, refresh } = useCatalog();
  const [band, setBand] = useState<Partial<Band> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function seedBands() {
    try {
      await api.seedBands();
      await refresh(['bands']);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro.');
    }
  }

  async function removeBand(b: Band) {
    if (!confirm(`Apagar o elástico ${b.name}? Se ele já foi usado, fica arquivado para o histórico continuar certo.`)) return;
    await api.deleteBand(b.id);
    await refresh(['bands']);
  }

  return (
    <div className="space-y-10">
      {error && <Notice>{error}</Notice>}

      <section>
        <SectionTitle
          action={
            <Button onClick={() => setBand({ color: BAND_COLORS[2], name: '' })}>
              <Plus className="size-4" aria-hidden /> Elástico
            </Button>
          }
        >
          Elásticos
        </SectionTitle>
        <p className="-mt-1 mb-3 text-sm text-dust">
          Coloque a faixa de resistência que a marca informa para cada cor. O ponto médio vira a “carga
          estimada” usada para comparar treinos — não é o peso exato, é uma régua consistente. A forma
          como você prende ou ajusta o elástico é escrita livremente em cada série, durante o treino.
        </p>
        {!bands.length ? (
          <Panel className="p-5 text-sm text-dust">
            Nenhum elástico ainda.{' '}
            <Button size="sm" variant="outline" className="ml-2" onClick={seedBands}>
              Carregar cores comuns de superband
            </Button>
            <p className="mt-2 text-xs text-faint">Dá para editar os kg depois, conforme a embalagem dos seus.</p>
          </Panel>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {bands.map((b) => (
              <Panel key={b.id} className={cx('flex items-center gap-3 p-3', b.archived && 'opacity-50')}>
                <BandSwatch color={b.color} className="size-7" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {b.name} {b.archived && <span className="text-xs text-faint">(arquivado)</span>}
                  </p>
                  <p className="text-xs text-dust">
                    {b.minKg != null || b.maxKg != null ? `${b.minKg ?? '?'}–${b.maxKg ?? '?'} kg · ≈${bandMidKg(b)} kg` : 'sem faixa'}
                    {b.brand && ` · ${b.brand}`}
                  </p>
                </div>
                <button aria-label="Editar" onClick={() => setBand(b)} className="rounded p-1.5 text-faint hover:text-starlight">
                  <Pencil className="size-4" aria-hidden />
                </button>
                {b.archived ? (
                  <button aria-label="Restaurar" title="Restaurar" onClick={() => api.updateBand(b.id, { archived: false }).then(() => refresh(['bands']))} className="rounded p-1.5 text-faint hover:text-starlight">
                    <Archive className="size-4" aria-hidden />
                  </button>
                ) : (
                  <button aria-label="Apagar" onClick={() => removeBand(b)} className="rounded p-1.5 text-faint hover:text-rose-300">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </Panel>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Grupos musculares</SectionTitle>
        <p className="-mt-1 mb-3 text-sm text-dust">
          Crie subcategorias dentro de cada grupo (ex.: Peitoral → superior, médio, inferior) para filtrar
          exercícios ao montar o treino. Toque no nome para renomear. Para mover vários exercícios de uma vez,
          use “Organizar” na aba Exercícios.
        </p>
        <MuscleGroupsSettings />
      </section>

      <section>
        <SectionTitle>Seus dados</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <a href="/api/export/sets.csv" download>
            <Button variant="outline" tabIndex={-1}>
              <Download className="size-4" aria-hidden /> Séries em CSV (Excel)
            </Button>
          </a>
          <a href="/api/export/backup.json" download>
            <Button variant="outline" tabIndex={-1}>
              <Download className="size-4" aria-hidden /> Backup completo (JSON)
            </Button>
          </a>
        </div>
      </section>

      <section>
        <SectionTitle>No celular</SectionTitle>
        <Panel className="flex gap-3 p-4 text-sm leading-relaxed text-dust">
          <Smartphone className="size-5 shrink-0 text-nebula-soft" aria-hidden />
          <p>
            Instale como app: no iPhone, Safari → Compartilhar → <em>Adicionar à Tela de Início</em>. No Android,
            Chrome → menu → <em>Instalar app</em>. O acesso fica lembrado neste aparelho.
          </p>
        </Panel>
        <Button variant="danger" className="mt-4" onClick={onLogout}>
          <LogOut className="size-4" aria-hidden /> Sair deste aparelho
        </Button>
      </section>

      {band && (
        <BandModal
          band={band}
          onClose={() => setBand(null)}
          onSaved={async () => {
            setBand(null);
            await refresh(['bands']);
          }}
        />
      )}
    </div>
  );
}

function BandModal({ band, onClose, onSaved }: { band: Partial<Band>; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(band);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const body = {
      name: v.name?.trim() ?? '',
      color: v.color ?? '#ef4444',
      brand: v.brand?.trim() || null,
      minKg: v.minKg ?? null,
      maxKg: v.maxKg ?? null,
      notes: v.notes?.trim() || null,
    };
    try {
      if (band.id) await api.updateBand(band.id, body);
      else await api.createBand(body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro.');
    }
  }
  return (
    <Modal title={band.id ? `Editar ${band.name}` : 'Novo elástico'} onClose={onClose} footer={<div className="flex justify-end pb-1"><Button onClick={save}>Salvar</Button></div>}>
      <div className="space-y-4">
        <Field label="Nome (cor)">
          <Input value={v.name ?? ''} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Vermelho" autoFocus />
        </Field>
        <div>
          <p className="mb-1.5 text-sm text-dust">Cor</p>
          <div className="flex flex-wrap items-center gap-2">
            {BAND_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={v.color === c}
                onClick={() => setV({ ...v, color: c })}
                className={cx('size-8 rounded-full ring-2 ring-offset-2 ring-offset-deep', v.color === c ? 'ring-white' : 'ring-transparent')}
                style={{ background: c }}
              />
            ))}
            <input type="color" value={v.color ?? '#ef4444'} onChange={(e) => setV({ ...v, color: e.target.value })} aria-label="Outra cor" className="size-8 cursor-pointer rounded-full border-0 bg-transparent" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Resistência mínima (kg)">
            <NumberInput decimal value={v.minKg} onChange={(n) => setV({ ...v, minKg: n })} />
          </Field>
          <Field label="Resistência máxima (kg)">
            <NumberInput decimal value={v.maxKg} onChange={(n) => setV({ ...v, maxKg: n })} />
          </Field>
        </div>
        <Field label="Marca">
          <Input value={v.brand ?? ''} onChange={(e) => setV({ ...v, brand: e.target.value })} />
        </Field>
        <Field label="Observação">
          <Input value={v.notes ?? ''} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Largura, comprimento, estado do elástico" />
        </Field>
        {error && <Notice>{error}</Notice>}
      </div>
    </Modal>
  );
}
