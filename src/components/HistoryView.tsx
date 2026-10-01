import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, StretchHorizontal, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import {
  formatDay,
  formatDuration,
  formatSeconds,
  localDay,
  parseDay,
  shiftDay,
  WEEKDAYS_SHORT,
} from '../lib/format';
import type { BodyMetric, CalendarDay, Checkin, Comparison, SessionListItem } from '../lib/types';
import { ComparisonView } from './ComparisonView';
import { LineChart } from './LineChart';
import { Button, cx, Field, Input, Modal, Notice, NumberInput, Panel, SectionTitle, Spinner } from './ui';

const WEEKS = 18;

export function HistoryView({ onOpenSession }: { onOpenSession: (id: number) => void }) {
  const today = localDay();
  const [day, setDay] = useState(today);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [recent, setRecent] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Grade começa num domingo, WEEKS semanas atrás.
  const gridStart = useMemo(() => {
    const d = parseDay(today);
    d.setDate(d.getDate() - d.getDay() - (WEEKS - 1) * 7);
    return localDay(d);
  }, [today]);

  useEffect(() => {
    api.calendar(gridStart, today).then((r) => setCalendar(r.days)).catch((e) => setError(e.message));
    api.sessions({ limit: 25 }).then((r) => setRecent(r.sessions)).catch((e) => setError(e.message));
  }, [gridStart, today]);

  return (
    <div className="space-y-10">
      <section>
        <SectionTitle>Histórico</SectionTitle>
        {error && <Notice>{error}</Notice>}
        <Heatmap start={gridStart} today={today} days={calendar} selected={day} onSelect={setDay} />
      </section>

      <DayPanel day={day} today={today} onDay={setDay} onOpenSession={onOpenSession} />

      <section>
        <SectionTitle>Últimos treinos</SectionTitle>
        {!recent ? (
          <Spinner />
        ) : !recent.length ? (
          <p className="text-sm text-faint">Nenhum treino registrado ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {recent.map((s) => (
              <button
                key={s.id}
                onClick={() => setDay(s.day)}
                className="flex w-full items-center gap-3 rounded-xl border border-ridge bg-black/15 px-3 py-2.5 text-left text-sm hover:border-nebula-soft/50"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="w-28 shrink-0 text-dust first-letter:uppercase">{formatDay(s.day)}</span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="hidden text-faint sm:inline">
                  {s.setsDone} séries · {formatDuration(s.durationMs)}
                </span>
                {s.exercisesSkipped > 0 && <span className="text-xs text-amber">{s.exercisesSkipped} pulado{s.exercisesSkipped > 1 ? 's' : ''}</span>}
                {s.status !== 'completed' && (
                  <span className={cx('text-xs', s.status === 'active' ? 'text-cyan' : 'text-faint')}>
                    {s.status === 'active' ? 'em andamento' : 'interrompido'}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      <BodySection />
    </div>
  );
}

/** Mapa de calor de um tom só: quanto mais coisa no dia, mais forte o violeta. */
function Heatmap({
  start,
  today,
  days,
  selected,
  onSelect,
}: {
  start: string;
  today: string;
  days: CalendarDay[];
  selected: string;
  onSelect: (d: string) => void;
}) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const [hover, setHover] = useState<string | null>(null);
  // No celular a grade não cabe: começa rolada até a semana atual.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);
  const cols = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => shiftDay(start, w * 7 + d)),
  );
  const level = (d?: CalendarDay) => (d ? Math.min(3, d.sessions.length * 2 + (d.checkins > 0 ? 1 : 0)) : 0);
  const shades = ['bg-white/5', 'bg-nebula/35', 'bg-nebula/65', 'bg-nebula-soft'];
  const info = hover ? byDay.get(hover) : null;

  return (
    <Panel className="p-4">
      <div ref={scroller} className="flex gap-2 overflow-x-auto pb-1">
        <div className="grid shrink-0 grid-rows-7 gap-1 pt-0 text-[10px] text-faint">
          {WEEKDAYS_SHORT.map((w, i) => (
            <span key={w} className="flex h-3.5 items-center sm:h-4">
              {i % 2 === 1 ? w : ''}
            </span>
          ))}
        </div>
        {cols.map((col, i) => (
          <div key={i} className="grid shrink-0 grid-rows-7 gap-1">
            {col.map((d) => {
              const future = d > today;
              const data = byDay.get(d);
              return (
                <button
                  key={d}
                  disabled={future}
                  onClick={() => onSelect(d)}
                  onMouseEnter={() => setHover(d)}
                  onMouseLeave={() => setHover(null)}
                  aria-label={`${formatDay(d)}: ${data ? `${data.sessions.length} treinos, ${data.checkins} alongamentos` : 'nada'}`}
                  className={cx(
                    'size-3.5 rounded-[4px] sm:size-4',
                    future ? 'opacity-0' : shades[level(data)],
                    d === selected && 'ring-2 ring-cyan',
                    d === today && d !== selected && 'ring-1 ring-white/50',
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-faint">
        <span>
          {hover
            ? `${formatDay(hover)} — ${info ? [info.sessions.map((s) => s.name).join(', '), info.checkins ? `${info.checkins} alongamento(s)` : ''].filter(Boolean).join(' · ') : 'nada registrado'}`
            : 'Toque num dia para ver o que foi feito.'}
        </span>
        <span className="flex items-center gap-1">
          menos {shades.map((s) => <span key={s} className={cx('size-3 rounded-[3px]', s)} />)} mais
        </span>
      </div>
    </Panel>
  );
}

/** O que foi feito num dia, cada treino comparado com a última vez do mesmo treino. */
function DayPanel({
  day,
  today,
  onDay,
  onOpenSession,
}: {
  day: string;
  today: string;
  onDay: (d: string) => void;
  onOpenSession: (id: number) => void;
}) {
  const [items, setItems] = useState<{ sessions: SessionListItem[]; comparisons: Record<number, Comparison>; checkins: Checkin[] } | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    const [s, c] = await Promise.all([api.sessions({ from: day, to: day }), api.checkins(day, day)]);
    const comps = await Promise.all(s.sessions.filter((x) => x.status === 'completed').map((x) => api.compare(x.id)));
    setItems({
      sessions: s.sessions,
      comparisons: Object.fromEntries(comps.map((c) => [c.session.id, c])),
      checkins: c.checkins,
    });
  }, [day]);

  useEffect(() => {
    load().catch(() => setItems({ sessions: [], comparisons: {}, checkins: [] }));
  }, [load]);

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => onDay(shiftDay(day, -1))} aria-label="Dia anterior">
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <h2 className="flex-1 text-center font-reader text-2xl first-letter:uppercase sm:flex-none">
          {day === today ? 'Hoje' : formatDay(day, { weekday: 'long', month: 'long' })}
        </h2>
        <Button variant="ghost" size="sm" onClick={() => onDay(shiftDay(day, 1))} disabled={day >= today} aria-label="Próximo dia">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        {day !== today && (
          <Button variant="ghost" size="sm" onClick={() => onDay(today)}>
            Hoje
          </Button>
        )}
      </div>

      {!items ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : !items.sessions.length && !items.checkins.length ? (
        <Panel className="p-5 text-sm text-dust">Nada registrado neste dia.</Panel>
      ) : (
        <div className="space-y-6">
          {items.sessions.map((s) => (
            <Panel key={s.id} className="p-4 sm:p-5">
              {items.comparisons[s.id] ? (
                <ComparisonView data={items.comparisons[s.id]!} />
              ) : (
                <p className="text-sm">
                  {s.name} — {s.status === 'active' ? 'em andamento' : 'interrompido'} · {s.setsDone} séries
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => onOpenSession(s.id)}>
                  <Pencil className="size-4" aria-hidden /> {s.status === 'active' ? 'Continuar' : 'Ver / corrigir séries'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`Apagar o registro de "${s.name}" deste dia? Não dá para desfazer.`)) return;
                    await api.deleteSession(s.id);
                    load();
                  }}
                >
                  <Trash2 className="size-4" aria-hidden /> Apagar
                </Button>
              </div>
            </Panel>
          ))}
          {items.checkins.length > 0 && (
            <Panel className="p-4">
              <p className="mb-2 text-sm font-medium">Alongamentos avulsos</p>
              <ul className="space-y-1 text-sm">
                {items.checkins.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <StretchHorizontal className="size-4 text-cyan" aria-hidden />
                    {c.name}
                    {c.seconds ? <span className="text-dust">· {formatSeconds(c.seconds)}</span> : null}
                    {c.notes && <span className="text-faint">— {c.notes}</span>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </section>
  );
}

function BodySection() {
  const [rows, setRows] = useState<BodyMetric[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = () => api.body().then((r) => setRows(r.metrics)).catch(() => setRows([]));
  useEffect(() => {
    load();
  }, []);

  const weights = (rows ?? []).filter((r) => r.weightKg != null).reverse();

  return (
    <section>
      <SectionTitle
        action={
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Registrar
          </Button>
        }
      >
        Peso e medidas
      </SectionTitle>
      {!rows ? (
        <Spinner />
      ) : !rows.length ? (
        <p className="text-sm text-faint">Registre peso e medidas de vez em quando para acompanhar junto com os treinos.</p>
      ) : (
        <div className="space-y-3">
          {weights.length >= 2 && (
            <Panel className="p-3">
              <p className="mb-1 px-1 text-sm text-dust">Peso corporal</p>
              <LineChart
                height={150}
                unit=" kg"
                color="var(--color-cyan)"
                points={weights.map((r) => ({ key: String(r.id), label: formatDay(r.day, { weekday: undefined }), value: r.weightKg! }))}
              />
            </Panel>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-faint">
                <tr>
                  <th className="py-1 pr-3 font-normal">Dia</th>
                  <th className="pr-3 font-normal">Peso</th>
                  <th className="pr-3 font-normal">Cintura</th>
                  <th className="pr-3 font-normal">Peito</th>
                  <th className="pr-3 font-normal">Braço</th>
                  <th className="pr-3 font-normal">Coxa</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-ridge">
                    <td className="py-2 pr-3 text-dust">{formatDay(r.day)}</td>
                    <td className="pr-3 tabular-nums">{r.weightKg ?? '—'}</td>
                    <td className="pr-3 tabular-nums">{r.waistCm ?? '—'}</td>
                    <td className="pr-3 tabular-nums">{r.chestCm ?? '—'}</td>
                    <td className="pr-3 tabular-nums">{r.armCm ?? '—'}</td>
                    <td className="pr-3 tabular-nums">{r.thighCm ?? '—'}</td>
                    <td>
                      <button aria-label="Apagar" onClick={() => api.deleteBody(r.id).then(load)} className="p-1 text-faint hover:text-rose-300">
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {adding && (
        <BodyModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </section>
  );
}

function BodyModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<Partial<BodyMetric>>({ day: localDay() });
  const [error, setError] = useState<string | null>(null);
  const num = (k: keyof BodyMetric, label: string) => (
    <Field label={label}>
      <NumberInput decimal value={v[k] as number | null} onChange={(n) => setV({ ...v, [k]: n })} />
    </Field>
  );
  return (
    <Modal
      title="Peso e medidas"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2 pb-1">
          <Button
            onClick={() =>
              api
                .createBody({ ...v, day: v.day! })
                .then(onSaved)
                .catch((e) => setError(e.message))
            }
          >
            Salvar
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dia">
          <Input type="date" value={v.day} max={localDay()} onChange={(e) => setV({ ...v, day: e.target.value })} />
        </Field>
        {num('weightKg', 'Peso (kg)')}
        {num('waistCm', 'Cintura (cm)')}
        {num('chestCm', 'Peito (cm)')}
        {num('armCm', 'Braço (cm)')}
        {num('thighCm', 'Coxa (cm)')}
      </div>
      <Field label="Observação">
        <Input value={v.notes ?? ''} onChange={(e) => setV({ ...v, notes: e.target.value || null })} />
      </Field>
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
    </Modal>
  );
}
